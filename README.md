# نظام إدارة الصندوق العائلي / التجاري

نظام ويب متكامل لإدارة الصناديق العائلية والتجارية الخاصة.

## ✅ بناء ناجح — جاهز للنشر

```
Route (app)
├ /               → redirect to /dashboard
├ /login          → صفحة تسجيل الدخول
├ /dashboard      → لوحة التحكم + كاش لحظي
├ /investors      → المستثمرون
├ /investments    → الاستثمارات
├ /expenses       → المصاريف
├ /distributions  → التوزيعات والهيكلة
├ /reports        → التقارير والرسوم البيانية
├ /investor-portal → بوابة المستثمر (عزل تام)
├ /account-statement → كشف الحساب
├ /users          → المستخدمون والصلاحيات
└ /settings       → الإعدادات
```

---

## خطوات النشر

### 1. Firebase

1. [Firebase Console](https://console.firebase.google.com) → New Project
2. فعّل **Authentication** → Email/Password
3. فعّل **Firestore Database** → Start in production mode
4. انسخ إعدادات المشروع من **Project Settings → Your apps → Web app**

### 2. GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/family-fund.git
git push -u origin main
```

### 3. Vercel

1. [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. أضف Environment Variables (Settings → Environment Variables):

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

3. Deploy!

### 4. إنشاء حساب المدير الأول

من Firebase Console → Authentication → Add user:
- Email: `admin@yourfund.com`
- Password: اختر كلمة مرور قوية

ثم Firestore → users → Add document (ID = uid من Authentication):
```json
{
  "name": "اسم المدير",
  "email": "admin@yourfund.com",
  "role": "manager",
  "status": "active",
  "createdAt": "<timestamp>"
}
```

### 5. Firestore Security Rules

انسخ محتوى `firestore.rules` إلى Firestore → Rules → Publish.

---

## الميزات

| الميزة | الوصف |
|--------|-------|
| الكاش اللحظي | يحسب تلقائياً من الحركات — لا يدوي |
| الصلاحيات | 3 أدوار + صلاحيات تفصيلية للإداريين |
| سجل النشاط | كل عملية مسجلة بالتاريخ والمنفذ |
| عزل المستثمر | لا يرى إلا بياناته الخاصة |
| التوزيع التلقائي | وفق الملكية في يوم التوزيع |
| الاستثمارات المتعثرة | لا تحذف — تتابع حتى الإغلاق |
| الاعتماد الثنائي | توزيعات ومصاريف تحتاج اعتماد المدير |
| تصدير CSV | لجميع التقارير |

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Firebase · Recharts · Vercel
