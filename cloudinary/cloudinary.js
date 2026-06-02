/**
 * Cloudinary 圖片雲端儲存設定 (Cloudinary Configuration)
 *
 * Cloudinary 是一個雲端媒體管理服務，提供圖片/影片的上傳、儲存、轉換與 CDN 派送。
 * 本系統用它來儲存員工請假申請時上傳的附件（病假診斷書、證明文件等）。
 *
 * 為什麼用 Cloudinary 而非本地儲存：
 * - 雲端部署環境（如 Render）的檔案系統是暫存性的，重啟後本地檔案會消失
 * - Cloudinary 提供 CDN 加速，前端讀取附件更快
 * - 不需要自己處理檔案的刪除、備份與存取權限
 *
 * 所有憑證（cloud_name、api_key、api_secret）存放在 .env，
 * 不寫在原始碼中以避免洩漏到版本控制系統。
 */

import { v2 as cloudinary } from 'cloudinary'

// 設定 Cloudinary SDK 的認證資訊
// 這三個值從 Cloudinary 後台取得，並存放在 .env 環境變數中
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Cloudinary 帳戶名稱
  api_key: process.env.CLOUDINARY_API_KEY,       // API 金鑰（公開識別碼）
  api_secret: process.env.CLOUDINARY_API_SECRET, // API 密鑰（保密，不可對外公開）
})

// 匯出已設定好的 cloudinary 實體，供 multer-storage-cloudinary 使用
export default cloudinary
