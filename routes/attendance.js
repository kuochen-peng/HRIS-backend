/**
 * 出勤路由 (Attendance Routes)
 *
 * 定義所有 /attendance 前綴的 API 端點。
 * 所有端點都需要 JWT token 驗證（只有登入的員工才能打卡）。
 *
 * 端點清單：
 * POST  /attendance/checkIn   → 上班打卡
 * GET   /attendance/attendance → 取得個人出勤紀錄
 * PATCH /attendance/checkOut  → 下班打卡
 *
 * 注意：出勤功能只有自己的資料，不支援查看他人的紀錄
 * （管理者查詢員工出勤為未來擴充功能）
 */

import { Router } from 'express'
import * as attendance from '../controllers/attendance.js'
import * as auth from '../middlewares/auth.js'

const router = Router()

// 上班打卡：驗證身份後記錄上班時間，自動判斷出勤狀態
router.post('/checkIn', auth.token, attendance.checkIn)

// 取得出勤紀錄：只回傳當前登入者自己的紀錄
router.get('/attendance', auth.token, attendance.getAttendance)

// 下班打卡：驗證身份後記錄下班時間，自動判斷早退
router.patch('/checkOut', auth.token, attendance.checkOut)

export default router
