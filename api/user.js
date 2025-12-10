<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - Knockout</title>
    <style>
        body { font-family: sans-serif; background: #0f3460; color: white; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; background: #16213e; padding: 15px; border-radius: 10px; margin-bottom: 20px; }
        .balance { color: #4caf50; font-weight: bold; font-size: 18px; }
        
        .lang-select { background: #0f3460; color: white; border: 1px solid #e94560; padding: 5px; border-radius: 5px; }
        
        h1 { text-align: center; color: #e94560; }
        .logout-btn { background: #e94560; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; margin-left: 10px; }
        
        .user-info { display: flex; align-items: center; }
    </style>
</head>
<body>

    <div class="header">
        <div>
            <span data-key="welcome">স্বাগতম</span>, 
            <b id="username">User</b>
        </div>
        
        <div class="user-info">
            <select id="langSelect" class="lang-select" onchange="changeLanguage(this.value)">
                <option value="bn">🇧🇩</option>
                <option value="en">🇺🇸</option>
            </select>
            <button onclick="logout()" class="logout-btn" data-key="logout_btn">Log Out</button>
        </div>
    </div>

    <div style="text-align: center; background: #1a1a2e; padding: 20px; border-radius: 10px;">
        <h3 data-key="balance_lbl">ব্যালেন্স</h3>
        <h1 style="margin: 0;">৳ <span id="bal">0</span></h1>
    </div>

    <h1 data-key="tour_title" style="margin-top: 30px;">🔥 টুর্নামেন্ট চলছে 🔥</h1>
    <p style="text-align: center;" data-key="coming_soon">শীঘ্রই আসছে...</p>

    <script src="lang.js"></script>
    <script>
        const user = JSON.parse(localStorage.getItem('user'));
        
        if (!user) {
            window.location.href = '/'; 
        } else {
            document.getElementById('username').innerText = user.name;
            document.getElementById('bal').innerText = user.balance;
        }

        function logout() {
            localStorage.removeItem('user');
            window.location.href = '/';
        }
    </script>
</body>
</html>
