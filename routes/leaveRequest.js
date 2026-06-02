/**
 * 請假申請路由 (LeaveRequest Routes)
 *
 * 定義所有 /leaveRequest 前綴的 API 端點。
 *
 * 端點清單：
 * POST  /leaveRequest      → 建立請假申請（所有登入者）
 * GET   /leaveRequest/all  → 取得所有員工的申請（manager 或 admin 限定）
 * GET   /leaveRequest/my   → 取得自己的申請紀錄（所有登入者）
 * PATCH /leaveRequest/:id  → 更新申請狀態（審核或撤銷）
 *
 * 中間件串接說明：
 * - POST / 在 auth.token 之後加上 uploadAttachment，
 *   讓 multer 先解析 multipart/form-data 並上傳附件，再進入 controller
 * - GET /all 在 auth.token 之後加上 auth.atLeastManager，
 *   確保只有管理者可以看到所有人的假單
 */

import { Router } from 'express'
import { create, getAllLeaveRequest, getMyLeaveRequest, updateStatus } from '../controllers/leaveRequest.js'
import * as auth from '../middlewares/auth.js'
import { uploadAttachment } from '../middlewares/upload.js'

const router = Router()

// 建立請假申請：先驗 token，再處理檔案上傳，最後進 controller
// uploadAttachment 中間件會把 Cloudinary URL 放在 req.file.path
router.post('/', auth.token, uploadAttachment, create)

// 取得所有申請：manager 或 admin 用於審核頁面
router.get('/all', auth.token, auth.atLeastManager, getAllLeaveRequest)

// 取得自己的申請：員工查看個人請假歷史
router.get('/my', auth.token, getMyLeaveRequest)

// 更新申請狀態：審核（同意/駁回）或撤銷，任何登入者皆可呼叫（controller 內不限角色）
router.patch('/:id', auth.token, updateStatus)

export default router
