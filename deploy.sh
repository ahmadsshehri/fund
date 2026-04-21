#!/bin/bash
# ==============================================
# نظام إدارة الصندوق - سكربت النشر التلقائي
# ==============================================
set -e

echo "🚀 بدء عملية النشر..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check required tools
echo -e "${BLUE}▶ التحقق من الأدوات المطلوبة...${NC}"
command -v git >/dev/null 2>&1 || { echo -e "${RED}❌ git غير مثبت${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js غير مثبت${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm غير مثبت${NC}"; exit 1; }

echo -e "${GREEN}✓ جميع الأدوات متوفرة${NC}"

# Step 1: GitHub
echo ""
echo -e "${BLUE}▶ الخطوة 1: رفع المشروع على GitHub${NC}"
echo ""
read -p "  أدخل اسم المستخدم على GitHub: " GH_USER
read -p "  أدخل اسم الـ Repository (مثال: family-fund): " GH_REPO

# Check if remote already set
if git remote get-url origin >/dev/null 2>&1; then
  echo -e "${YELLOW}  ⚠️  Remote origin موجود مسبقاً، سيتم تحديثه${NC}"
  git remote set-url origin "https://github.com/$GH_USER/$GH_REPO.git"
else
  git remote add origin "https://github.com/$GH_USER/$GH_REPO.git"
fi

echo ""
echo -e "${YELLOW}  📌 تأكد أنك أنشأت الـ repository على GitHub أولاً:${NC}"
echo -e "     https://github.com/new"
echo ""
read -p "  هل أنشأت الـ repository؟ (y/n): " CONFIRM
if [[ "$CONFIRM" != "y" ]]; then
  echo "  أنشئ الـ repository ثم شغل السكربت مرة ثانية"
  exit 0
fi

git push -u origin main
echo -e "${GREEN}✓ تم رفع الكود على GitHub${NC}"

# Step 2: Vercel
echo ""
echo -e "${BLUE}▶ الخطوة 2: النشر على Vercel${NC}"
echo ""

# Install Vercel CLI if not present
if ! command -v vercel >/dev/null 2>&1; then
  echo "  تثبيت Vercel CLI..."
  npm install -g vercel
fi

echo ""
echo -e "${YELLOW}  📌 المتطلبات قبل المتابعة:${NC}"
echo "     1. أنشئ حساباً على Firebase: https://console.firebase.google.com"
echo "     2. أنشئ مشروعاً جديداً في Firebase"
echo "     3. فعّل Authentication → Email/Password"
echo "     4. فعّل Firestore Database (Production mode)"
echo "     5. اضغط على ⚙️ Project Settings → Your apps → Web app"
echo "     6. انسخ config object"
echo ""
read -p "  هل لديك Firebase keys جاهزة؟ (y/n): " FB_READY

if [[ "$FB_READY" == "y" ]]; then
  echo ""
  read -p "  FIREBASE_API_KEY: " FB_API_KEY
  read -p "  FIREBASE_AUTH_DOMAIN: " FB_AUTH_DOMAIN
  read -p "  FIREBASE_PROJECT_ID: " FB_PROJECT_ID
  read -p "  FIREBASE_STORAGE_BUCKET: " FB_STORAGE_BUCKET
  read -p "  FIREBASE_MESSAGING_SENDER_ID: " FB_SENDER_ID
  read -p "  FIREBASE_APP_ID: " FB_APP_ID

  # Create .env.local
  cat > .env.local << EOF
NEXT_PUBLIC_FIREBASE_API_KEY=$FB_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$FB_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$FB_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$FB_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$FB_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=$FB_APP_ID
EOF
  echo -e "${GREEN}✓ تم إنشاء .env.local${NC}"
fi

# Deploy to Vercel
echo ""
echo "  جاري النشر على Vercel..."
vercel --prod

echo ""
echo -e "${GREEN}🎉 تم النشر بنجاح!${NC}"
echo ""
echo -e "${BLUE}▶ الخطوة الأخيرة: إنشاء حساب المدير${NC}"
echo ""
echo "  1. اذهب إلى Firebase Console → Authentication → Users"
echo "  2. انقر Add user"
echo "  3. أدخل البريد الإلكتروني وكلمة المرور"
echo "  4. انسخ الـ UID"
echo "  5. اذهب إلى Firestore → users → Add document (ID = UID)"
echo "  6. أضف الحقول:"
echo '     { "name": "...", "email": "...", "role": "manager", "status": "active" }'
echo ""
echo "  ثم اذهب إلى Firestore → Rules وانسخ محتوى firestore.rules"
echo ""
echo -e "${GREEN}✅ النظام جاهز للاستخدام!${NC}"
