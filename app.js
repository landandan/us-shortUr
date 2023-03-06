'use strict'

const path = require('path')
const _ = require('lodash')

const AV = require('leanengine')
const LC = require('leancloud-storage')
const Koa = require('koa')
const Router = require('koa-router')
const views = require('koa-views')
const statics = require('koa-static')
const bodyParser = require('koa-bodyparser')

// Loads cloud function definitions.
// You can split it into multiple files but do not forget to load them in the main file.
require('./cloud')

const app = new Koa()

// Configures template engine.
app.use(views(path.join(__dirname, 'views')))

// Configures static resources directory.
app.use(statics(path.join(__dirname, 'public')))

const router = new Router()
app.use(router.routes())

// Loads LeanEngine middleware.
app.use(AV.koa())

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

router.post('/saveUserData', async (ctx, next) => {
  // console.log('saveUserData ctx:', ctx.req.body)
  await next()
  const postData = ctx.request.body
  console.log(`koaBody获取到的post数据===>`, postData)
  const UserData = LC.Object.extend('user_data')
  const userData = new UserData()
  userData.set('user', ctx.request.body.user)
  userData.set('data', ctx.request.body.data)

  // 设置权限
  const getAcl = () => {
    const acl = new LC.ACL()
    acl.setPublicReadAccess(!0)
    acl.setPublicWriteAccess(!1)
    return acl
  }

  userData.setACL(getAcl())

  // 将对象保存到云端
  userData.save().then(
    (success) => {
      // 成功保存之后，执行其他逻辑
      console.log('保存成功:', success)
      ctx.status = 200
      ctx.body = {
        code: '200',
        message: '保存成功',
      }
    },
    (error) => {
      // 异常处理
      console.log('保存失败:', error)
      ctx.status = 500
      ctx.body = {
        code: '500',
        message: '保存失败，请稍后再试',
      }
    }
  )
})

router.post('/getUserData', async (ctx, next) => {
  // console.log('getUserData ctx:', ctx)
  await next()
  const user = ctx.request.body.user
  if (!_.isEmpty(user)) {
    const query = new LC.Query('user_data')
    query.equalTo('user', user)
    const res = await query.find()
    if (res && res.length > 0) {
      const data = _.get(res, '0.attributes.data', '')
      console.log('=====:', data)
      // this.redirect(redirectUrl);
      // ctx.type = 'text/javascript'
      // ctx.body = ';(function(){ window.location.href = ' + redirectUrl + '})()'
      ctx.status = 200
      // ctx.redirect(redirectUrl)
      ctx.body = {
        code: '200',
        message: '查询成功',
        data,
      }
    } else {
      ctx.status = 500
      ctx.body = {
        code: '500',
        message: '查询失败，请稍后再试',
      }
    }
  }
})

module.exports = app
