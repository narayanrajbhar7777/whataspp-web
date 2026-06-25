# Trybe Stock Tally Scheduler - User Guide

## 📋 Overview
The Trybe Stock Tally Scheduler automatically fetches stock data from your API and sends formatted reports via WhatsApp.

## 🔑 WhatsApp Session ID Explained

### What is it?
The **WhatsApp Session ID** is your **username** that you use to login to the WhatsApp Scheduler system.

### How it works:
1. When you log in with your username (e.g., "admin"), that becomes your Session ID
2. The system creates a separate WhatsApp connection for each user
3. Each Session ID can have its own WhatsApp account linked to it

### Default Login:
- **Username**: `admin`
- **Password**: `admin@123`
- **Session ID**: `admin` (automatically uses your username)

### Example:
- If you login as user: `john`
- Your Session ID will be: `john`
- You need to scan the QR code for user `john` to link WhatsApp

## 🚀 Getting Started

### Step 1: Login to the System
1. Go to `http://localhost:3000`
2. Login with:
   - Username: `admin`
   - Password: `admin@123`

### Step 2: Connect WhatsApp
1. Click the "Not Connected" button in the top bar
2. Enter your Session ID (your username, e.g., "admin")
3. Click "Initialize Session"
4. Scan the QR code with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code shown

### Step 3: Use Trybe Scheduler
1. Click "📊 Trybe Report Scheduler" in the sidebar
2. The Session ID will be auto-filled with your username
3. Add recipient WhatsApp numbers (one per line):
   ```
   919876543210
   919123456789
   ```
4. Choose "Send Now" or "Schedule Later"
5. Click "Preview Report" to see the message format
6. Click "Send Report" to deliver

## 📱 Message Format

The report will be formatted like this:

```
TRYBE STOCK TALLY REPORT
--------------------------------
Voucher ID : 4417853
Voucher : MFGSERVICE-tally-65001/2026
Department : MFG SERVICE
PCS : 850
Date : 24-06-2026 17:42
--------------------------------
Voucher ID : 4409328
Voucher : FacetPlanningStockControl-tally-59439/2026
Department : Facet Planning Stock Control
PCS : 91
Date : 23-06-2026 18:41
--------------------------------
```

## 🔧 Configuration

### API Endpoint
Default: `http://192.168.100.22:8080/KG_WEB_APP0/KGAPI/powerbi/GetTrybeStockTally`

You can change this in the form if needed.

### Phone Number Format
- Use international format without + or spaces
- Example: `919876543210` (India)
- Example: `14155551234` (USA)

## ❓ Troubleshooting

### "WhatsApp session is not active"
- Make sure you've scanned the QR code
- Check if the "Not Connected" pill shows "Connected"
- Your Session ID must match your logged-in username

### "Session expired"
- You've been logged out
- Login again at `http://localhost:3000/login`

### "Failed to fetch API"
- Check if the API URL is correct
- Ensure the API server is running and accessible
- Verify network connectivity

## 📚 Additional Features

### Schedule for Later
1. Select "Schedule Later"
2. Choose date and time
3. The report will be automatically sent at the scheduled time
4. View scheduled reports in "Scheduler Reports" section

### Multiple Recipients
- Add as many phone numbers as needed
- Each number on a new line
- All recipients will receive the same report

## 🆘 Support

If you need help:
1. Check the WhatsApp connection status
2. Verify your Session ID matches your username
3. Ensure the API is responding correctly
4. Check the browser console for error messages

---

**Server URL**: http://localhost:3000  
**Trybe Scheduler**: http://localhost:3000/trybe-scheduler.html
