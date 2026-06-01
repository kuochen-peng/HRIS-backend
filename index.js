import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import { StatusCodes } from 'http-status-codes'
import cors from 'cors'
import './passport/passport.js'
import userRouter from './routes/user.js'
import attendanceRouter from './routes/attendance.js'
import leaveRequestRouter from './routes/leaveRequest.js'

mongoose
  .connect(process.env.DB_URL)
  .then(() => {
    console.log('資料庫連線成功')
  })
  .catch((error) => {
    console.log('資料庫連線失敗')
    console.log(error)
  })

const app = express()

app.use(cors())

app.use(express.json())
app.use((err, req, res, _next) => {
  res.status(StatusCodes.BAD_REQUEST).json({
    message: '資料格式錯誤',
  })
})

app.get('/', (req, res) => {
  res.status(200).send('ok')
})

app.use('/user', userRouter)
app.use('/attendance', attendanceRouter)
app.use('/leaveRequest', leaveRequestRouter)

app.listen(process.env.PORT || 4000, () => {
  console.log('伺服器啟動 http://localhost:4000')
})
