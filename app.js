'use strict'

const path = require('path')
const _ = require('lodash')

const AV = require('leanengine')
const LC = require('leancloud-storage')
const Koa = require('koa')
const cors = require('koa2-cors')
const Router = require('koa-router')
const views = require('koa-views')
const statics = require('koa-static')
const bodyParser = require('koa-bodyparser')

// Loads cloud function definitions.
// You can split it into multiple files but do not forget to load them in the main file.
require('./cloud')

const app = new Koa()

app.use(
  cors({
    origin: function (ctx) {
      //设置允许来自指定域名请求
      const whiteList = [
        'https://short.landandan.cn',
        'https://blog.landandan.cn',
        'https://zxzl.landandan.cn',
        'http://localhost:8080',
        'http://localhost:8081',
      ] //可跨域白名单
      // console.log('ctx:', ctx)
      // let url = ctx.header.referer.substr(0, ctx.header.referer.length - 1)
      // if (whiteList.includes(url)) {
      //   return url // 注意，这里域名末尾不能带/，否则不成功，所以在之前我把/通过substr干掉了
      // }
      // return 'http://localhost:8080' //默认允许本地请求8080端口可跨域
      return whiteList.indexOf(ctx.header.origin) > -1 ? ctx.header.origin : ''
    },
    maxAge: 5, //指定本次预检请求的有效期，单位为秒。
    credentials: true, //是否允许发送Cookie
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], //设置所允许的HTTP请求方法
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'], //设置服务器支持的所有头信息字段
    exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'], //设置获取其他自定义字段
  })
)

// Configures template engine.
app.use(views(path.join(__dirname, 'views')))

// Configures static resources directory.
app.use(statics(path.join(__dirname, 'public')))

const router = new Router()
app.use(router.routes())

// Loads LeanEngine middleware.
app.use(AV.koa())

// app.use(async (ctx, next) => {
//   ctx.set('Access-Control-Allow-Origin', '*')
//   ctx.set('Access-Control-Allow-Headers', 'Content-Type')
//   ctx.set('Access-Control-Allow-Methods', 'POST')
//   await next()
// })

app.use(bodyParser())

router.get('/', async function (ctx) {
  ctx.state.currentTime = new Date()
  await ctx.render('./index.html')
})

// You can store routings in multiple files according to their categories.
app.use(require('./routes/todos').routes())

router.get('/:id', async (ctx, next) => {
  let id = ctx.request.url.replace('/', '')
  // console.log('ctx:', JSON.stringify(ctx))
  console.log('id:', id)
  if (!_.isEmpty(id)) {
    const query = new LC.Query('shortUrl')
    query.equalTo('uuid', id)
    const res = await query.find()
    if (res && res.length > 0) {
      const redirectUrl = _.get(res, '0.attributes.url', '')
      console.log('=====:', redirectUrl)
      // this.redirect(redirectUrl);
      // ctx.type = 'text/javascript'
      // ctx.body = ';(function(){ window.location.href = ' + redirectUrl + '})()'
      ctx.status = 302
      ctx.redirect(redirectUrl)
      ctx.body = '这是给前端的回应'
    }
  }
})

router.post('/api/saveUserData', async (ctx, next) => {
  // console.log('saveUserData ctx:', ctx.req.body)
  await next()
  const postData = ctx.request.body || []
  console.log(`koaBody获取到的post数据===>`, postData)

  const user = ctx.request.body.user
  let oldList = []
  if (!_.isEmpty(user)) {
    const query = new LC.Query('user_data')
    query.equalTo('user', user)
    const res = await query.find()
    if (res && res.length > 0) {
      // console.log('res:', res)
      oldList = _.map(res, (item) => {
        return { ...item.attributes, objId: item.id }
      })
    }
  }

  const UserData = LC.Object.extend('user_data')
  const saveList = []

  const dataList = postData.data

  let status = 200
  let response = {}
  if (dataList.length > 0) {
    for (let i = 0; i < dataList.length; i++) {
      if (
        _.some(oldList, (old) => {
          return old.id == dataList[i].id
        })
      ) {
        // 更新
        const userData = new UserData()
        userData.create_without_data(
          _.find(oldList, (o) => o.dataId == dataList[i].id).objId
        )
        userData.set('user', user)
        userData.set('id', dataList[i].id)
        userData.set('name', dataList[i].name)
        userData.set('data', dataList[i].data)
        userData.set('saveTime', dataList[i].saveTime)

        // 设置权限
        const getAcl = () => {
          const acl = new LC.ACL()
          acl.setPublicReadAccess(!0)
          acl.setPublicWriteAccess(!1)
          return acl
        }

        userData.setACL(getAcl())

        saveList.push(userData)
      } else {
        // 新增
        const userData = new UserData()
        userData.set('user', user)
        userData.set('id', dataList[i].id)
        userData.set('name', dataList[i].name)
        userData.set('data', dataList[i].data)
        userData.set('saveTime', dataList[i].saveTime)

        // 设置权限
        const getAcl = () => {
          const acl = new LC.ACL()
          acl.setPublicReadAccess(!0)
          acl.setPublicWriteAccess(!1)
          return acl
        }

        userData.setACL(getAcl())

        saveList.push(userData)
      }
    }

    // 将对象保存到云端
    const saveData = async () => {
      return UserData.saveAll(saveList).then(
        (success) => {
          // 成功保存之后，执行其他逻辑
          console.log('保存成功:', success)
          status = 200
          response = {
            success: true,
            message: '保存成功',
          }
        },
        (error) => {
          // 异常处理
          console.log('保存失败:', error)
          status = 500
          response = {
            success: false,
            message: '保存失败，请稍后再试',
          }
        }
      )
    }

    await saveData()
  } else {
    status = 200
    response = {
      success: false,
      message: '没有检测到数据需要保存',
    }
  }

  ctx.status = status
  ctx.body = response
})

router.post('/api/getUserData', async (ctx, next) => {
  // console.log('getUserData ctx:', ctx)
  await next()
  const user = ctx.request.body.user
  if (!_.isEmpty(user)) {
    const query = new LC.Query('user_data')
    query.equalTo('user', user)
    const res = await query.find()
    if (res && res.length > 0) {
      console.log('res:', res)
      const data = _.map(res, (item) => {
        return {
          ...item.attributes,
        }
      })

      console.log('=====:', data)
      // this.redirect(redirectUrl);
      // ctx.type = 'text/javascript'
      // ctx.body = ';(function(){ window.location.href = ' + redirectUrl + '})()'
      ctx.status = 200
      // ctx.redirect(redirectUrl)
      ctx.body = {
        success: true,
        message: '查询成功',
        data,
      }
    } else {
      ctx.status = 200
      ctx.body = {
        success: false,
        message: '没有查到对应数据，请确认手机号码再尝试',
      }
    }
  }
})

module.exports = app
