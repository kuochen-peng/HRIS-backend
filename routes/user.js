/**
 * 使用者路由 (User Routes)
 *
 * 定義所有 /user 前綴的 API 端點，並串接對應的認證中間件與 controller 函式。
 *
 * 路由設計說明：
 * - 中間件由左至右依序執行，前一個失敗則後面不會執行
 * - auth.token  → 驗證 JWT（必須登入）
 * - auth.admin  → 驗證是否為 admin（需在 auth.token 之後）
 *
 * 端點清單：
 * POST   /user                → 新增員工帳號（admin 限定）
 * POST   /user/login          → 登入（不需要 token，但需要帳密驗證）
 * GET    /user/profile        → 取得個人資料（需要登入）
 * GET    /user/getUser        → 取得所有員工列表（admin 限定）
 * PATCH  /user/refresh        → 刷新 JWT token（需要 token，允許過期）
 * PATCH  /user/updateUser/:id → 更新員工資料（admin 限定）
 * DELETE /user/logout         → 登出（需要 token，允許過期）
 */

import { Router } from 'express'
import * as user from '../controllers/user.js'
import * as auth from '../middlewares/auth.js'

const router = Router()

// 新增員工：只有 admin 可以建立帳號，防止任意人員自行註冊
router.post('/', auth.token, auth.admin, user.create)

// 登入：先由 auth.login 驗證帳密，通過後才進入 login controller 產生 token
router.post('/login', auth.login, user.login)

// 取得個人資料：頁面重整後前端用 token 重新取得使用者資訊
router.get('/profile', auth.token, user.profile)

// 取得所有員工列表：人員管理頁面用，admin 限定
router.get('/getUser', auth.token, auth.admin, user.getUser)

// 刷新 token：前端偵測到 401 時自動呼叫，允許用過期 token 換新 token
router.patch('/refresh', auth.token, user.refresh)

// 更新員工資料：admin 修改員工的姓名、部門、工作時間等
router.patch('/updateUser/:id', auth.token, auth.admin, user.updateUser)

// 登出：移除 token，允許用過期 token 執行（確保能登出）
router.delete('/logout', auth.token, user.logout)

export default router
