<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Match Manager</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>.custom-scroll::-webkit-scrollbar { width: 4px; background: #374151; } .custom-scroll::-webkit-scrollbar-thumb { background: #9ca3af; border-radius: 4px; }</style>
</head>
<body class="bg-gray-900 text-white pb-24 select-none">

    <!-- Header -->
    <header class="p-4 bg-gray-800 shadow-md flex items-center sticky top-0 z-50 border-b border-gray-700">
        <a href="/admin-dashboard.html" class="mr-4 text-gray-400 active:scale-90"><i class="fa-solid fa-arrow-left text-xl"></i></a>
        <div><h1 class="font-bold text-lg leading-tight truncate w-64" id="cat_title">Manage Matches</h1><p class="text-[10px] text-gray-400">Match Operations</p></div>
    </header>

    <!-- Create Match Form -->
    <div class="p-4 bg-gray-800 m-4 rounded-xl border border-gray-700 shadow-lg">
        <h3 class="font-bold text-md mb-3 border-b border-gray-600 pb-2 flex justify-between items-center text-white">
            <span id="form_title">Create New Match</span>
            <button onclick="resetForm()" id="cancel_btn" class="hidden text-[10px] bg-red-900 text-red-300 px-2 py-1 rounded border border-red-700">Cancel</button>
        </h3>
        <input type="hidden" id="match_id">
        <select id="cat_id" class="w-full bg-gray-900 p-3 mb-2 rounded-lg border border-gray-600 outline-none text-white focus:border-blue-500"><option value="">Loading Games...</option></select>
        <input type="text" id="m_title" placeholder="Match Title" class="w-full bg-gray-900 p-3 rounded-lg mb-2 text-sm border border-gray-600 outline-none text-white focus:border-blue-500 transition">
        
        <div class="grid grid-cols-2 gap-2 mb-2">
            <input type="number" id="m_fee" placeholder="Entry Fee" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
            <input type="number" id="m_prize" placeholder="Total Prize Pool" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
        </div>
        
        <!-- NEW: Winners Count & Per Kill -->
        <div class="grid grid-cols-2 gap-2 mb-2">
            <input type="number" id="m_kill" placeholder="Per Kill Rate (৳)" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
            <select id="m_winners" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
                <option value="1">Winner: Top 1 Only</option>
                <option value="2">Winner: Top 2</option>
                <option value="3">Winner: Top 3</option>
            </select>
        </div>

        <div class="grid grid-cols-2 gap-2 mb-2">
            <select id="m_type" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
                <option value="Solo">Solo</option><option value="Duo">Duo</option><option value="Squad">Squad</option><option value="Clash Squad">Clash Squad</option>
            </select>
            <input type="text" id="m_map" placeholder="Map Name" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
        </div>
        
        <div class="grid grid-cols-2 gap-2 mb-2">
             <input type="number" id="m_spots" placeholder="Total Spots" class="bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-white text-sm">
             <input type="datetime-local" id="m_time" class="w-full bg-gray-900 p-3 rounded-lg border border-gray-600 outline-none text-gray-400 text-sm">
        </div>

        <div class="grid grid-cols-2 gap-2 mb-4 bg-black/20 p-2 rounded border border-gray-600/50">
            <input type="text" id="room_id" placeholder="Room ID" class="bg-transparent border-b border-gray-500 text-white text-xs p-1 outline-none">
            <input type="text" id="room_pass" placeholder="Password" class="bg-transparent border-b border-gray-500 text-white text-xs p-1 outline-none">
        </div>
        
        <button onclick="handleMatch()" id="submit_btn" class="w-full bg-blue-600 py-3 rounded-lg font-bold shadow-lg text-white">Publish Match</button>
    </div>

    <!-- Match List -->
    <div class="px-4">
        <h3 class="font-bold text-lg mb-3 border-l-4 border-blue-500 pl-2">Active Matches</h3>
        <div id="match_list" class="space-y-4 pb-10"><p class="text-center text-gray-500 mt-10 animate-pulse">Loading matches...</p></div>
    </div>

    <!-- 1. PARTICIPANTS & KICK MODAL -->
    <div id="playersModal" class="fixed inset-0 bg-black/90 hidden items-center justify-center z-[80] p-4 backdrop-blur-sm">
        <div class="bg-gray-800 p-5 rounded-2xl w-full max-w-sm h-[70vh] flex flex-col relative shadow-2xl border border-gray-700 animate-zoom">
            <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-700">
                <h3 class="font-bold text-lg text-blue-400">Participants & Kick</h3>
                <button onclick="document.getElementById('playersModal').style.display='none'" class="text-gray-400 text-2xl hover:text-white">&times;</button>
            </div>
            <div id="modal_player_list" class="flex-1 overflow-y-auto pr-1 custom-scroll text-sm">Loading...</div>
        </div>
    </div>

    <!-- 2. UPDATE RESULTS MODAL -->
    <div id="updateModal" class="fixed inset-0 bg-black/90 hidden items-center justify-center z-[90] p-4 backdrop-blur-sm">
        <div class="bg-gray-800 p-5 rounded-2xl w-full max-w-sm h-[80vh] flex flex-col relative shadow-2xl border border-gray-700">
            <div class="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                <h3 class="font-bold text-blue-400">Update Stats Only</h3>
                <button onclick="document.getElementById('updateModal').style.display='none'" class="text-white text-xl">&times;</button>
            </div>
            <input type="hidden" id="up_match_id"><input type="hidden" id="up_is_solo">
            <div class="flex justify-between text-[10px] font-bold text-gray-500 uppercase px-2 mb-1">
                <span class="w-1/2">Player/Team</span><span class="w-1/4 text-center">Rank #</span><span class="w-1/4 text-center">Kills</span>
            </div>
            <div id="update_list" class="flex-1 overflow-y-auto space-y-2"></div>
            <button onclick="saveResults()" class="w-full bg-blue-600 py-3 mt-3 rounded-lg font-bold text-white">SAVE STATS</button>
        </div>
    </div>

    <!-- 3. DISTRIBUTE PRIZE MODAL -->
    <div id="prizeModal" class="fixed inset-0 bg-black/90 hidden items-center justify-center z-[100] p-4 backdrop-blur-sm">
        <div class="bg-gray-800 p-5 rounded-2xl w-full max-w-sm h-[85vh] flex flex-col relative shadow-2xl border border-gray-700">
            <div class="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                <h3 class="font-bold text-green-400">Distribute Prize</h3>
                <button onclick="document.getElementById('prizeModal').style.display='none'" class="text-white text-xl">&times;</button>
            </div>
            <input type="hidden" id="pz_match_id"><input type="hidden" id="pz_is_solo">
            <div class="flex justify-between text-[10px] font-bold text-gray-500 uppercase px-2 mb-1">
                <span class="w-1/3">Winner (Rank)</span><span class="w-1/3 text-center">Kill (৳)</span><span class="w-1/3 text-center">Prize (৳)</span>
            </div>
            <div id="prize_list" class="flex-1 overflow-y-auto space-y-2"></div>
            <div class="pt-3 border-t border-gray-700">
                <div class="flex justify-between text-xs font-bold text-gray-400 mb-2"><span>Total Sending:</span><span class="text-green-400">৳<span id="pz_total">0</span></span></div>
                <button onclick="sendMoney()" class="w-full bg-green-600 py-3 rounded-lg font-bold text-white shadow-lg">CONFIRM & SEND</button>
            </div>
        </div>
    </div>

    <script>
        const user = JSON.parse(localStorage.getItem('user'));
        const urlParams = new URLSearchParams(window.location.search);
        let urlCatId = urlParams.get('cat_id');
        const urlCatName = urlParams.get('name');
        if(urlCatName) document.getElementById('cat_title').innerText = decodeURIComponent(urlCatName);

        async function loadCatsAndMatches() {
            try {
                const res = await fetch('/api/admin', { method: 'POST', body: JSON.stringify({ type: 'get_categories' }) });
                const data = await res.json();
                const sel = document.getElementById('cat_id');
                sel.innerHTML = '<option value="">Select Game...</option>';
                data.forEach(c => { if(c.type!=='official') { const isSel=(urlCatId && c.id == urlCatId); sel.innerHTML += `<option value="${c.id}" ${isSel?'selected':''}>${c.title}</option>`; } });
                if(urlCatId) { sel.value = urlCatId; sel.disabled = true; loadMatches(); }
            } catch(e){}
        }

        async function loadMatches() {
            const list = document.getElementById('match_list');
            try {
                const activeCatId = urlCatId || document.getElementById('cat_id').value;
                const res = await fetch('/api/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'get_admin_matches', category_id:activeCatId||null }) });
                const matches = await res.json();
                list.innerHTML = matches.map(m => `
                    <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-3 relative group">
                        <div class="flex justify-between items-start mb-2">
                            <div><h4 class="font-bold text-white text-md tracking-wide">#${m.id} ${m.title}</h4><p class="text-xs text-blue-300 mt-1">${new Date(m.match_time).toLocaleString()}</p></div>
                            <div class="flex gap-2"><button onclick='editMatch(${JSON.stringify(m).replace(/'/g, "&#39;")})' class="bg-yellow-600/20 text-yellow-500 p-1.5 rounded"><i class="fa-solid fa-pen"></i></button><button onclick="deleteMatch(${m.id})" class="bg-red-600/20 text-red-500 p-1.5 rounded"><i class="fa-solid fa-trash"></i></button></div>
                        </div>
                        <div class="flex justify-between text-[10px] font-bold uppercase mb-2 text-gray-400"><span>Fee: ${m.entry_fee}</span><span>Prize: ${m.prize_pool}</span><span>Type: ${m.match_type}</span></div>
                        
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <select onchange="updateStatus(${m.id}, this.value)" class="w-full bg-black/20 text-xs p-1 rounded border border-gray-600 text-white uppercase font-bold outline-none"><option value="upcoming" ${m.status==='upcoming'?'selected':''}>🔵 Upcoming</option><option value="open" ${m.status==='open'?'selected':''}>🟢 Open</option><option value="live" ${m.status==='live'?'selected':''}>🔴 Live</option><option value="completed" ${m.status==='completed'?'selected':''}>🏁 Done</option></select>
                            <button onclick="viewPlayers(${m.id}, '${m.match_type}')" class="bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded text-xs font-bold hover:bg-blue-600 hover:text-white">Participants & Kick</button>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <button onclick="openUpdateResults(${m.id}, '${m.match_type}')" class="bg-indigo-600 text-white text-xs py-2 rounded font-bold">Update Results</button>
                            <button onclick="openPrizeDistribute(${m.id}, '${m.match_type}')" class="bg-green-700 text-white text-xs py-2 rounded font-bold border border-green-600 hover:bg-green-600">🏆 Distribute Prize</button>
                        </div>
                    </div>`).join('');
            } catch(e) { list.innerHTML = `<p class="text-center text-gray-500">No matches.</p>`; }
        }

        // --- 1. PARTICIPANTS VIEW ---
        async function viewPlayers(id, type) {
            document.getElementById('playersModal').style.display='flex';
            const con = document.getElementById('modal_player_list');
            con.innerHTML = 'Loading...';
            
            const res = await fetch('/api/admin', {method:'POST', body:JSON.stringify({type:'get_participants_list', match_id:id})});
            const d = await res.json();
            
            if(d.data.length===0) { con.innerHTML='<p class="text-center text-gray-500">Empty List</p>'; return; }
            
            const isSolo = type === 'Solo';
            con.innerHTML = d.data.map(p => `
                <div class="bg-gray-900 border border-gray-700 p-2 rounded flex justify-between items-center mb-1">
                    <div><p class="text-xs font-bold text-white">${p.name}</p><p class="text-[9px] text-gray-400">${isSolo ? `UID: ${p.game_uid}` : `${p.members} Members`}</p></div>
                    <button onclick="kickUser('${p.name}', ${id}, ${isSolo})" class="text-red-500 bg-red-500/10 px-2 py-1 rounded text-[10px] font-bold">Kick</button>
                </div>`).join('');
        }

        async function kickUser(name, mid, isSolo) {
            if(confirm("Kick user?")) {
                await fetch('/api/admin', {method:'POST', body:JSON.stringify({type:'kick_participant', match_id:mid, target_name:name, is_solo:isSolo})});
                alert("Kicked!"); viewPlayers(mid, isSolo?'Solo':'Team');
            }
        }

        // --- 2. UPDATE RESULTS ---
        async function openUpdateResults(id, type) {
            document.getElementById('updateModal').style.display='flex';
            document.getElementById('up_match_id').value = id;
            document.getElementById('up_is_solo').value = (type==='Solo')?'1':'0';
            
            const res = await fetch('/api/admin', { method:'POST', body:JSON.stringify({ type:'get_result_data', match_id:id }) });
            const d = await res.json();
            
            document.getElementById('update_list').innerHTML = d.data.map(p => `
                <div class="bg-gray-900 border border-gray-700 p-2 rounded flex items-center justify-between update-row" data-name="${p.name}">
                    <span class="text-xs text-white w-1/2 truncate font-bold">${p.name}</span>
                    <input type="number" placeholder="#" value="${p.rank||''}" class="w-1/4 bg-black text-white text-xs p-1 text-center border border-gray-600 rounded up-rank">
                    <input type="number" placeholder="0" value="${p.kills||0}" class="w-1/4 bg-black text-white text-xs p-1 text-center border border-gray-600 rounded up-kill">
                </div>`).join('');
        }

        async function saveResults() {
            const mid = document.getElementById('up_match_id').value;
            const isSolo = document.getElementById('up_is_solo').value === '1';
            let stats = [];
            document.querySelectorAll('.update-row').forEach(row => {
                stats.push({ name: row.getAttribute('data-name'), rank: row.querySelector('.up-rank').value, kills: row.querySelector('.up-kill').value });
            });
            await fetch('/api/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'update_match_results_only', match_id:mid, stats:stats, is_solo:isSolo }) });
            alert("Saved!"); document.getElementById('updateModal').style.display='none';
        }

        // --- 3. DISTRIBUTE PRIZE ---
        async function openPrizeDistribute(id, type) {
            document.getElementById('prizeModal').style.display='flex';
            document.getElementById('pz_match_id').value = id;
            document.getElementById('pz_is_solo').value = (type==='Solo')?'1':'0';

            const res = await fetch('/api/admin', { method:'POST', body:JSON.stringify({ type:'get_result_data', match_id:id }) });
            const d = await res.json();
            
            document.getElementById('prize_list').innerHTML = d.data.map(p => {
                const isWinner = p.rank > 0 && p.rank <= d.winners_count;
                return `
                <div class="bg-gray-900 border ${isWinner?'border-green-500/50 bg-green-900/10':'border-gray-700'} p-2 rounded flex items-center justify-between prize-row" data-name="${p.name}">
                    <div class="w-1/3"><p class="text-xs text-white font-bold truncate">${p.name}</p><p class="text-[9px] text-gray-400">Rank #${p.rank || '-'}</p></div>
                    <div class="w-1/3 text-center"><span class="text-xs text-gray-400">Kill: ${p.kills}</span><br><span class="text-xs text-blue-400 font-bold pz-kill-money">৳${p.kill_money}</span></div>
                    <input type="number" value="${p.rank_prize}" class="w-1/3 bg-black text-green-400 text-xs p-1 text-center border border-gray-600 rounded font-bold pz-amount" oninput="calcPzTotal()">
                </div>`;
            }).join('');
            calcPzTotal();
        }

        function calcPzTotal() {
            let t = 0;
            document.querySelectorAll('.prize-row').forEach(row => {
                const rankP = parseFloat(row.querySelector('.pz-amount').value) || 0;
                const killP = parseFloat(row.querySelector('.pz-kill-money').innerText.replace('৳','')) || 0;
                t += rankP + killP;
            });
            document.getElementById('pz_total').innerText = t;
        }

        async function sendMoney() {
            if(!confirm("Send Money?")) return;
            const mid = document.getElementById('pz_match_id').value;
            const isSolo = document.getElementById('pz_is_solo').value === '1';
            let prizes = [];
            document.querySelectorAll('.prize-row').forEach(row => {
                const rankP = parseFloat(row.querySelector('.pz-amount').value) || 0;
                const killP = parseFloat(row.querySelector('.pz-kill-money').innerText.replace('৳','')) || 0;
                const total = rankP + killP;
                if(total > 0) prizes.push({ name: row.getAttribute('data-name'), amount: total });
            });
            await fetch('/api/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'distribute_prizes_final', match_id:mid, prizes:prizes, is_solo:isSolo }) });
            alert("Sent!"); document.getElementById('prizeModal').style.display='none'; loadMatches();
        }

        // --- Other Helpers ---
        async function handleMatch() {
            const id=document.getElementById('match_id').value;
            const body = {
                type: id ? 'edit_match' : 'create_daily_match',
                match_id: id,
                category_id: document.getElementById('cat_id').value || urlCatId,
                title: document.getElementById('m_title').value,
                entry_fee: document.getElementById('m_fee').value,
                prize_pool: document.getElementById('m_prize').value,
                per_kill: document.getElementById('m_kill').value,
                winners_count: document.getElementById('m_winners').value,
                match_type: document.getElementById('m_type').value,
                map: document.getElementById('m_map').value,
                total_spots: document.getElementById('m_spots').value,
                room_id: document.getElementById('room_id').value,
                room_pass: document.getElementById('room_pass').value,
                match_time: document.getElementById('m_time').value
            };
            if(!body.title || !body.match_time) return alert("Fill fields");
            body.match_time = new Date(body.match_time).toISOString().slice(0, 19).replace('T', ' ');
            await fetch('/api/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
            resetForm(); loadMatches();
        }

        function editMatch(m) {
            document.getElementById('match_id').value = m.id; document.getElementById('m_title').value = m.title; document.getElementById('m_fee').value = m.entry_fee; document.getElementById('m_prize').value = m.prize_pool; document.getElementById('m_kill').value = m.per_kill; document.getElementById('m_winners').value = m.winners_count || 1; document.getElementById('m_type').value = m.match_type; document.getElementById('m_map').value = m.map; document.getElementById('m_spots').value = m.total_spots; document.getElementById('room_id').value = m.room_id; document.getElementById('room_pass').value = m.room_pass;
            const d = new Date(m.match_time); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); document.getElementById('m_time').value = d.toISOString().slice(0,16);
            document.getElementById('submit_btn').innerText = "Update Match"; document.getElementById('cancel_btn').classList.remove('hidden'); window.scrollTo(0,0);
        }

        function resetForm() { document.getElementById('match_id').value = ''; document.getElementById('m_title').value = ''; document.getElementById('submit_btn').innerText = "Publish Match"; document.getElementById('cancel_btn').classList.add('hidden'); }
        async function deleteMatch(id) { if(confirm("Delete?")) { await fetch('/api/admin', {method:'POST', body:JSON.stringify({type:'delete_match', id:id})}); loadMatches(); } }
        async function updateStatus(id, newStatus) { await fetch('/api/admin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ type: 'update_match_status', match_id: id, new_status: newStatus }) }); }

        loadCatsAndMatches();
    </script>
</body>
</html>
