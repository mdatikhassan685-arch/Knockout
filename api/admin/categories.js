<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage Categories</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Rajdhani', sans-serif; }</style>
</head>
<body class="bg-gray-900 text-white min-h-screen p-4">

    <!-- Header -->
    <div class="flex justify-between items-center mb-6">
        <div class="flex items-center">
            <a href="/admin/dashboard" class="bg-gray-800 p-2 rounded-lg hover:bg-gray-700 mr-4 border border-gray-600">
                <i class="fa-solid fa-arrow-left"></i>
            </a>
            <h1 class="text-2xl font-bold text-blue-400">Categories</h1>
        </div>
        <button onclick="openModal()" class="bg-green-600 px-4 py-2 rounded-lg font-bold shadow hover:bg-green-500 flex items-center gap-2 transition active:scale-95">
            <i class="fa-solid fa-folder-plus"></i> New
        </button>
    </div>

    <!-- Category List -->
    <div id="catList" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <p class="text-center text-gray-500 col-span-2 py-10 animate-pulse">Loading categories...</p>
    </div>

    <!-- Add Modal -->
    <div id="modal" class="hidden fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div class="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-600 shadow-2xl relative">
            <button onclick="closeModal()" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fa-solid fa-times text-xl"></i></button>
            <h3 class="text-xl font-bold text-white mb-4">Add New Category</h3>
            
            <div class="space-y-3">
                <!-- Title Input -->
                <input type="text" id="catTitle" placeholder="Category Name" class="w-full bg-gray-900 border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500">
                
                <!-- Image URL Input -->
                <div>
                    <label class="block text-gray-400 text-xs mb-1 ml-1">Image Link (URL)</label>
                    <input type="text" id="catImage" placeholder="https://i.ibb.co/..." class="w-full bg-gray-900 border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500 text-sm">
                    <p class="text-[10px] text-gray-500 mt-1 ml-1">Tip: Upload image to <a href="https://imgbb.com" target="_blank" class="text-blue-400 hover:underline">ImgBB</a> and paste the link here.</p>
                </div>
                
                <!-- Type Selection -->
                <div class="flex gap-2">
                    <label class="flex items-center gap-2 bg-gray-900 p-3 rounded w-1/2 cursor-pointer border border-gray-600 hover:border-blue-500 transition">
                        <input type="radio" name="type" value="official" checked class="accent-blue-500 w-4 h-4"> 
                        <span class="text-sm font-bold">Official</span>
                    </label>
                    <label class="flex items-center gap-2 bg-gray-900 p-3 rounded w-1/2 cursor-pointer border border-gray-600 hover:border-green-500 transition">
                        <input type="radio" name="type" value="normal" class="accent-green-500 w-4 h-4"> 
                        <span class="text-sm font-bold">Normal</span>
                    </label>
                </div>

                <button onclick="createCategory()" id="createBtn" class="w-full bg-blue-600 py-3 rounded-lg font-bold hover:bg-blue-500 transition shadow-lg mt-2">Create Category</button>
            </div>
        </div>
    </div>

    <script>
        const admin = JSON.parse(localStorage.getItem('admin'));
        if (!admin) window.location.href = '/';

        async function loadCategories() {
            try {
                const res = await fetch('/api/admin/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'list', adminId: admin.id })
                });
                const data = await res.json();
                
                const list = document.getElementById('catList');
                list.innerHTML = '';

                if (data.categories.length === 0) {
                    list.innerHTML = `
                        <div class="col-span-2 text-center py-10 text-gray-500 border-2 border-dashed border-gray-700 rounded-xl">
                            <i class="fa-regular fa-folder-open text-4xl mb-2"></i>
                            <p>No categories found.</p>
                        </div>
                    `;
                    return;
                }

                data.categories.forEach(c => {
                    let badge = c.is_official 
                        ? '<span class="bg-blue-600/80 backdrop-blur text-xs px-2 py-1 rounded font-bold shadow">OFFICIAL</span>' 
                        : '<span class="bg-green-600/80 backdrop-blur text-xs px-2 py-1 rounded font-bold shadow">NORMAL</span>';

                    // Link Logic (পরের ধাপের জন্য)
                    // let link = c.is_official ? `/admin/official-tournaments?catId=${c.id}` : `/admin/normal-matches?catId=${c.id}`;
                    let link = '#'; // আপাতত

                    list.innerHTML += `
                        <div class="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 group cursor-pointer relative hover:border-blue-500 transition" onclick="window.location.href='${link}'">
                            <img src="${c.image || 'https://via.placeholder.com/400x200'}" class="w-full h-32 object-cover group-hover:scale-105 transition duration-500 opacity-80 group-hover:opacity-100">
                            <div class="absolute top-2 right-2 z-10">${badge}</div>
                            <div class="absolute bottom-0 w-full bg-gradient-to-t from-gray-900 to-transparent p-3 pt-10">
                                <div class="flex justify-between items-center">
                                    <h3 class="font-bold text-lg text-white drop-shadow-md">${c.title}</h3>
                                    <button onclick="event.stopPropagation(); deleteCategory(${c.id})" class="text-red-400 hover:text-red-500 p-2 bg-gray-900/50 rounded-full hover:bg-gray-900 transition"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
                });
            } catch (err) { console.error(err); }
        }

        async function createCategory() {
            const title = document.getElementById('catTitle').value;
            const image = document.getElementById('catImage').value;
            const type = document.querySelector('input[name="type"]:checked').value;
            const btn = document.getElementById('createBtn');

            if(!title || !image) return alert("Please fill all fields");

            btn.innerText = "Processing...";
            btn.disabled = true;

            try {
                const res = await fetch('/api/admin/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', title, image, type, adminId: admin.id })
                });
                
                const data = await res.json();
                if(data.success) {
                    closeModal();
                    loadCategories();
                    document.getElementById('catTitle').value = '';
                    document.getElementById('catImage').value = '';
                } else {
                    alert("Error: " + data.error);
                }
            } catch (error) {
                alert("Network Error");
            } finally {
                btn.innerText = "Create Category";
                btn.disabled = false;
            }
        }

        async function deleteCategory(id) {
            if(!confirm("Delete this category?")) return;
            await fetch('/api/admin/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', catId: id, adminId: admin.id })
            });
            loadCategories();
        }

        function openModal() { document.getElementById('modal').classList.remove('hidden'); }
        function closeModal() { document.getElementById('modal').classList.add('hidden'); }

        loadCategories();
    </script>
</body>
</html>
