/**
 * 伺服器入口點 (Entry Point)
 *
 * 這是整個後端應用的啟動檔案，負責：
 * 1. 載入環境變數 (.env 檔案)
 * 2. 連線 MongoDB 資料庫
 * 3. 初始化 Express 應用
 * 4. 掛載全域中間件 (CORS、JSON 解析、錯誤處理)
 * 5. 掛載各模組路由
 * 6. 啟動 HTTP 伺服器監聽
 *
 * 為什麼用 Express：Express 是 Node.js 最成熟的 Web 框架，
 * 路由與中間件機制讓程式碼易於模組化拆分。
 */

// 載入 .env 檔案中的環境變數（DB_URL、PORT、JWT_SECRET 等）
// 必須在所有其他 import 之前執行，確保後續模組能讀到這些變數
import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import { StatusCodes } from 'http-status-codes'
import cors from 'cors'

// 載入 Passport 設定，讓 passport-local 與 passport-jwt 策略在啟動時就完成註冊
import './passport/passport.js'

// 各功能模組的路由
import userRouter from './routes/user.js'
import attendanceRouter from './routes/attendance.js'
import leaveRequestRouter from './routes/leaveRequest.js'

// 連線 MongoDB 資料庫
// DB_URL 存放在 .env，避免帳密寫在原始碼內
// .then / .catch 只做啟動階段的連線狀態通知；
// Mongoose 在連線中斷時會自動重試，不需要在此另外實作重連邏輯
mongoose
  .connect(process.env.DB_URL)
  .then(() => {
    console.log('資料庫連線成功')
  })
  .catch((error) => {
    console.log('資料庫連線失敗')
    console.log(error)
  })

// 建立 Express 應用實體
const app = express()

// 開放跨域請求 (CORS)
// 前端 (Quasar/Vite，通常執行在不同 port) 打 API 時，瀏覽器會先發 preflight 請求，
// cors() 中間件會自動處理 OPTIONS 回應並加入允許的 HTTP 標頭
app.use(cors())

// 解析 JSON 格式的請求 body
// 讓 req.body 可以直接取得物件；不加這行的話 req.body 會是 undefined
app.use(express.json())

// 全域的 JSON 格式錯誤處理中間件
// 當 express.json() 解析 body 失敗（如語法錯誤的 JSON）時，
// Express 會把錯誤傳入這個四參數 error handler
app.use((err, req, res, _next) => {
  res.status(StatusCodes.BAD_REQUEST).json({
    message: '資料格式錯誤',
  })
})

// 根路由：健康檢查用途
// 部署平台（如 Render、Railway）會定期打這個端點確認服務存活
app.get('/', (req, res) => {
  res.status(200).send('ok')
})

// 掛載各功能路由
// /user        → 使用者相關 (登入、登出、個人資料、人員管理)
// /attendance  → 出勤相關 (上班打卡、下班打卡、查詢紀錄)
// /leaveRequest → 請假申請相關 (新增、審核、撤銷)
app.use('/user', userRouter)
app.use('/attendance', attendanceRouter)
app.use('/leaveRequest', leaveRequestRouter)

// 啟動 HTTP 伺服器
// PORT 優先讀環境變數（雲端部署時平台會指定），fallback 為本機開發用的 4000
app.listen(process.env.PORT || 4000, () => {
  console.log('伺服器啟動 http://localhost:4000')
})
