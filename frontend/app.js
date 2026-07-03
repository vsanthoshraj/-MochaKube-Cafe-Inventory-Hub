// Global Application State
let menuItems = [];
let inventory = [];
let cart = {}; // menuId -> quantity
let orders = [];
let availableIngredientsMap = {};

// API Base URL (Assumed same host since Python serves static files)
const API_BASE = '';

// DOM Elements
const podHostnameEl = document.getElementById('pod-hostname');
const dbHostEl = document.getElementById('db-host');
const healthStatusEl = document.getElementById('health-status');
const btnRefreshInfo = document.getElementById('btn-refresh-info');

const shopMenuGrid = document.getElementById('shop-menu-grid');
const cartItemsList = document.getElementById('cart-items-list');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const cartTotalEl = document.getElementById('cart-total');
const btnPlaceOrder = document.getElementById('btn-place-order');

const inventoryGrid = document.getElementById('inventory-items-grid');
const ordersTableBody = document.getElementById('orders-table-body');
const totalRevenueEl = document.getElementById('total-revenue');

const createMenuForm = document.getElementById('create-menu-form');
const recipeIngredientsContainer = document.getElementById('recipe-ingredients-container');
const btnAddRecipeIngredient = document.getElementById('btn-add-recipe-ingredient');
const adminMenuTableBody = document.getElementById('admin-menu-table-body');

const restockForm = document.getElementById('restock-form');
const addInventoryForm = document.getElementById('add-inventory-form');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupTabNavigation();
    setupEventListeners();
    
    // Initial fetches
    refreshSystemInfo();
    refreshData();
    
    // Auto-refresh System Info & Pod Name (every 5s) for load-balancing demonstration
    setInterval(refreshSystemInfo, 5000);
    
    // Auto-refresh data (every 10s) to keep multi-user changes in sync
    setInterval(refreshData, 10000);
});

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    let icon = '<i class="fa-solid fa-info-circle"></i>';
    if (type === 'success') {
        icon = '<i class="fa-solid fa-circle-check" style="color: var(--success)"></i>';
    } else if (type === 'error') {
        icon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger)"></i>';
    } else if (type === 'warning') {
        icon = '<i class="fa-solid fa-circle-exclamation" style="color: var(--warning)"></i>';
    }
    
    toast.innerHTML = `${icon} <span>${message}</span>`;
    toast.className = 'toast show';
    
    // Clear previous timeouts if click is spammed
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }
    
    toast.timeoutId = setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

// Modal controls
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Tab navigation handler
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const targetTab = tab.getAttribute('data-tab');
            const contents = document.querySelectorAll('.tab-content');
            contents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
        });
    });
}

function setupEventListeners() {
    // Refresh button
    btnRefreshInfo.addEventListener('click', () => {
        btnRefreshInfo.querySelector('i').classList.add('fa-spin');
        Promise.all([refreshSystemInfo(), refreshData()]).finally(() => {
            setTimeout(() => {
                btnRefreshInfo.querySelector('i').classList.remove('fa-spin');
            }, 500);
        });
    });

    // Cart Place Order
    btnPlaceOrder.addEventListener('click', handlePlaceOrder);

    // Recipe ingredient dynamic builder in config panel
    btnAddRecipeIngredient.addEventListener('click', addRecipeIngredientRow);

    // Forms submission
    createMenuForm.addEventListener('submit', handleCreateMenuItem);
    restockForm.addEventListener('submit', handleRestockSubmit);
    addInventoryForm.addEventListener('submit', handleAddInventorySubmit);

    // Filter categories
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderShopMenu(btn.getAttribute('data-category'));
        });
    });
}

// SYSTEM INFORMATION POLLING
async function refreshSystemInfo() {
    try {
        const res = await fetch(`${API_BASE}/api/system-info`);
        if (!res.ok) throw new Error('API down');
        const data = await res.json();
        
        podHostnameEl.textContent = data.hostname;
        podHostnameEl.classList.remove('loading');
        
        dbHostEl.textContent = data.db_host;
        dbHostEl.classList.remove('loading');
        
        if (data.db_connected) {
            healthStatusEl.textContent = 'Healthy';
            healthStatusEl.className = 'badge-value status-healthy';
        } else {
            healthStatusEl.textContent = 'Degraded (No DB)';
            healthStatusEl.className = 'badge-value status-unhealthy';
        }
    } catch (err) {
        podHostnameEl.textContent = 'Offline';
        podHostnameEl.classList.add('loading');
        dbHostEl.textContent = 'Offline';
        dbHostEl.classList.add('loading');
        healthStatusEl.textContent = 'Unhealthy';
        healthStatusEl.className = 'badge-value status-unhealthy';
    }
}

// DATA REFRESH FUNCTION
async function refreshData() {
    await Promise.all([
        fetchMenu(),
        fetchInventory(),
        fetchOrders()
    ]);
}

// FETCH INVENTORY
async function fetchInventory() {
    try {
        const res = await fetch(`${API_BASE}/api/inventory`);
        if (!res.ok) throw new Error('Failed to fetch inventory');
        inventory = await res.json();
        
        // Update helper map
        availableIngredientsMap = {};
        inventory.forEach(item => {
            availableIngredientsMap[item.id] = item;
        });

        renderInventoryGrid();
        updateRecipeFormDropdowns();
    } catch (err) {
        console.error(err);
        showToast('Error syncing inventory state', 'error');
    }
}

// FETCH MENU
async function fetchMenu() {
    try {
        const res = await fetch(`${API_BASE}/api/menu`);
        if (!res.ok) throw new Error('Failed to fetch menu');
        menuItems = await res.json();
        
        const activeCategory = document.querySelector('.filter-btn.active').getAttribute('data-category');
        renderShopMenu(activeCategory);
        renderAdminMenuTable();
    } catch (err) {
        console.error(err);
        showToast('Error syncing menu', 'error');
    }
}

// FETCH ORDERS
async function fetchOrders() {
    try {
        const res = await fetch(`${API_BASE}/api/orders`);
        if (!res.ok) throw new Error('Failed to fetch orders');
        orders = await res.json();
        
        renderOrders();
    } catch (err) {
        console.error(err);
    }
}

// RENDER CAFE SHOP MENU
function renderShopMenu(category = 'all') {
    if (menuItems.length === 0) {
        shopMenuGrid.innerHTML = `
            <div class="loading-spinner">
                <i class="fa-solid fa-mug-hot"></i>
                <p>No coffee or bakery items found. Seed the DB or add items in Configurations!</p>
            </div>
        `;
        return;
    }

    const filtered = category === 'all' 
        ? menuItems 
        : menuItems.filter(item => item.category === category);

    shopMenuGrid.innerHTML = '';
    
    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card';
        
        const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=60';
        
        // Gather ingredients list text
        const ingredientsText = item.ingredients.map(ing => {
            const displayQty = ing.unit === 'pcs' ? Math.round(ing.quantity_needed) : ing.quantity_needed;
            return `${displayQty}${ing.unit} ${ing.item_name}`;
        }).join(', ');

        card.innerHTML = `
            <div class="menu-image-container">
                <img src="${imgUrl}" alt="${item.name}" class="menu-img" onerror="this.src='https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=60'">
                <span class="menu-category-tag">${item.category}</span>
            </div>
            <div class="menu-info">
                <div class="menu-title-row">
                    <h3 class="menu-name">${item.name}</h3>
                    <span class="menu-price">$${parseFloat(item.price).toFixed(2)}</span>
                </div>
                <p class="menu-ingredients-list">
                    <span>Ingredients:</span> ${ingredientsText || 'None'}
                </p>
                <div class="card-actions">
                    <button class="btn btn-primary btn-block" onclick="addToCart(${item.id})">
                        <i class="fa-solid fa-plus-circle"></i> Add to Order
                    </button>
                </div>
            </div>
        `;
        shopMenuGrid.appendChild(card);
    });
}

// CART MANAGEMENT
function addToCart(menuId) {
    if (!cart[menuId]) {
        cart[menuId] = 0;
    }
    cart[menuId]++;
    updateCartUI();
    showToast('Added item to your tray', 'success');
}

function removeFromCart(menuId) {
    if (cart[menuId]) {
        cart[menuId]--;
        if (cart[menuId] <= 0) {
            delete cart[menuId];
        }
    }
    updateCartUI();
}

function adjustCartQty(menuId, amount) {
    if (amount > 0) {
        cart[menuId]++;
    } else {
        cart[menuId]--;
        if (cart[menuId] <= 0) {
            delete cart[menuId];
        }
    }
    updateCartUI();
}

function updateCartUI() {
    const keys = Object.keys(cart);
    cartItemsList.innerHTML = '';
    
    if (keys.length === 0) {
        cartItemsList.innerHTML = `<p class="empty-cart-msg">Your tray is empty. Select items from the menu to start order.</p>`;
        cartSubtotalEl.textContent = '$0.00';
        cartTotalEl.textContent = '$0.00';
        btnPlaceOrder.disabled = true;
        return;
    }

    let subtotal = 0;
    
    keys.forEach(menuId => {
        const item = menuItems.find(m => m.id === parseInt(menuId));
        if (!item) return;
        
        const qty = cart[menuId];
        const rowPrice = parseFloat(item.price) * qty;
        subtotal += rowPrice;
        
        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.innerHTML = `
            <div class="cart-item-details">
                <h4>${item.name}</h4>
                <span>$${parseFloat(item.price).toFixed(2)} each</span>
            </div>
            <div class="cart-qty-ctrl">
                <button class="qty-btn" onclick="adjustCartQty(${menuId}, -1)"><i class="fa-solid fa-minus"></i></button>
                <span class="cart-item-qty">${qty}</span>
                <button class="qty-btn" onclick="adjustCartQty(${menuId}, 1)"><i class="fa-solid fa-plus"></i></button>
            </div>
        `;
        cartItemsList.appendChild(row);
    });

    cartSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    cartTotalEl.textContent = `$${subtotal.toFixed(2)}`;
    btnPlaceOrder.disabled = false;
}

// PLACE ORDER HANDLER
async function handlePlaceOrder() {
    btnPlaceOrder.disabled = true;
    btnPlaceOrder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
    const itemsPayload = Object.keys(cart).map(menuId => ({
        menu_id: parseInt(menuId),
        quantity: cart[menuId]
    }));

    try {
        const res = await fetch(`${API_BASE}/api/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsPayload })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            // Insufficient inventory or other error
            throw new Error(data.details || data.error || 'Checkout failed');
        }
        
        showToast('Enjoy your coffee! Order registered successfully.', 'success');
        cart = {};
        updateCartUI();
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btnPlaceOrder.disabled = false;
        btnPlaceOrder.innerHTML = '<i class="fa-solid fa-check"></i> Complete Order';
    }
}

// RENDER INVENTORY
function renderInventoryGrid() {
    if (inventory.length === 0) {
        inventoryGrid.innerHTML = '<p class="text-center">No inventory items found.</p>';
        return;
    }

    inventoryGrid.innerHTML = '';
    
    inventory.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inventory-card';
        
        const qty = parseFloat(item.quantity);
        const minReq = parseFloat(item.min_required);
        
        // Calculate dynamic status and progress percentages
        let status = 'ok';
        let statusLabel = 'In Stock';
        let progressPercent = 100;
        
        // Reference capacity as 2x of min required, or current qty if higher
        const capacity = Math.max(minReq * 3, qty);
        progressPercent = Math.min((qty / capacity) * 100, 100);

        if (qty <= 0) {
            status = 'danger';
            statusLabel = 'Out of Stock!';
        } else if (qty < minReq) {
            status = 'warn';
            statusLabel = 'Low Stock Alert';
        }

        const displayQty = item.unit === 'pcs' ? Math.round(qty) : qty.toFixed(1);

        card.innerHTML = `
            <div class="inv-header">
                <div>
                    <h3 class="inv-name">${item.item_name}</h3>
                    <div class="inv-qty-display">${displayQty} <span>${item.unit}</span></div>
                </div>
                <span class="inv-status-label ${status}">
                    <i class="fa-solid ${status === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${statusLabel}
                </span>
            </div>
            <div>
                <div class="inv-progress-container">
                    <div class="inv-progress-bar status-${status}" style="width: ${progressPercent}%"></div>
                </div>
                <div class="inv-bottom">
                    <span style="font-size: 0.75rem; color: var(--text-muted)">Min threshold: ${minReq}${item.unit}</span>
                    <button class="btn btn-secondary btn-small" onclick="openRestockModal(${item.id}, '${item.item_name}', '${item.unit}')">
                        <i class="fa-solid fa-plus"></i> Restock
                    </button>
                </div>
            </div>
        `;
        inventoryGrid.appendChild(card);
    });
}

// OPEN RESTOCK MODAL
window.openRestockModal = function(id, name, unit) {
    document.getElementById('restock-item-id').value = id;
    document.getElementById('restock-title').textContent = `Restock: ${name}`;
    document.getElementById('restock-unit-label').textContent = unit;
    document.getElementById('restock-qty').value = '';
    openModal('restock-modal');
};

async function handleRestockSubmit(e) {
    e.preventDefault();
    const itemId = document.getElementById('restock-item-id').value;
    const qty = document.getElementById('restock-qty').value;
    
    try {
        const res = await fetch(`${API_BASE}/api/inventory/restock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: parseInt(itemId), quantity: parseFloat(qty) })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        showToast(data.message, 'success');
        closeModal('restock-modal');
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ADD NEW INVENTORY ITEM
async function handleAddInventorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('inv-item-name').value;
    const qty = document.getElementById('inv-qty').value;
    const unit = document.getElementById('inv-unit').value;
    const minReq = document.getElementById('inv-min').value;

    try {
        const res = await fetch(`${API_BASE}/api/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item_name: name,
                quantity: parseFloat(qty),
                unit: unit,
                min_required: parseFloat(minReq)
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(`Ingredient '${name}' created successfully`, 'success');
        closeModal('add-inventory-modal');
        addInventoryForm.reset();
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// RENDER ORDER HISTORY
function renderOrders() {
    if (orders.length === 0) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center">No orders registered yet.</td>
            </tr>
        `;
        totalRevenueEl.textContent = '$0.00';
        return;
    }

    ordersTableBody.innerHTML = '';
    let totalRevenue = 0;
    
    orders.forEach(order => {
        totalRevenue += parseFloat(order.total_price);
        
        const tr = document.createElement('tr');
        
        // Format Items list
        const itemsTags = order.items.map(item => {
            return `<span class="ordered-item-tag">${item.name} x${item.quantity}</span>`;
        }).join('');
        
        // Format Date
        const date = new Date(order.order_time).toLocaleString();

        tr.innerHTML = `
            <td>#${order.id}</td>
            <td>${date}</td>
            <td>${itemsTags}</td>
            <td style="color: var(--primary); font-weight:600">$${parseFloat(order.total_price).toFixed(2)}</td>
        `;
        ordersTableBody.appendChild(tr);
    });

    totalRevenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
}

// CONFIGURATION / ADMIN VIEW
function renderAdminMenuTable() {
    adminMenuTableBody.innerHTML = '';
    if (menuItems.length === 0) {
        adminMenuTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center">No menu items created yet.</td>
            </tr>
        `;
        return;
    }

    menuItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500">${item.name}</td>
            <td>$${parseFloat(item.price).toFixed(2)}</td>
            <td><span class="ordered-item-tag" style="background: rgba(255,255,255,0.05); color: #fff">${item.category}</span></td>
            <td>
                <button class="btn btn-danger-outline btn-small" onclick="deleteMenuItem(${item.id})">
                    <i class="fa-solid fa-trash-can"></i> Delete
                </button>
            </td>
        `;
        adminMenuTableBody.appendChild(tr);
    });
}

// DELETE MENU ITEM
window.deleteMenuItem = async function(id) {
    if (!confirm('Are you sure you want to delete this menu item?')) return;
    try {
        const res = await fetch(`${API_BASE}/api/menu/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Menu item removed', 'success');
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// DYNAMIC INGREDIENT ROW BUILDER IN RECIPE CREATION
function addRecipeIngredientRow() {
    const row = document.createElement('div');
    row.className = 'ingredient-input-row';
    
    // Build options list
    let optionsHtml = '<option value="">Select ingredient...</option>';
    inventory.forEach(item => {
        optionsHtml += `<option value="${item.id}" data-unit="${item.unit}">${item.item_name} (${item.unit})</option>`;
    });

    row.innerHTML = `
        <select class="recipe-ing-select" required onchange="handleRecipeIngSelectChange(this)">
            ${optionsHtml}
        </select>
        <div class="input-unit-group" style="margin-top: 0">
            <input type="number" class="recipe-ing-qty" step="0.01" min="0.01" placeholder="Qty" required>
            <span class="input-unit row-unit-label">-</span>
        </div>
        <button type="button" class="btn btn-danger-outline btn-small" onclick="this.parentElement.remove()" style="padding: 10px; border-radius: var(--radius-md)">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
    recipeIngredientsContainer.appendChild(row);
}

window.handleRecipeIngSelectChange = function(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const unit = selectedOption.getAttribute('data-unit') || '-';
    const row = selectEl.parentElement;
    row.querySelector('.row-unit-label').textContent = unit;
};

function updateRecipeFormDropdowns() {
    // Updates existing select dropdowns in the recipe form with new ingredients if added
    const selects = document.querySelectorAll('.recipe-ing-select');
    selects.forEach(select => {
        const currentVal = select.value;
        let optionsHtml = '<option value="">Select ingredient...</option>';
        inventory.forEach(item => {
            optionsHtml += `<option value="${item.id}" data-unit="${item.unit}" ${item.id == currentVal ? 'selected' : ''}>${item.item_name} (${item.unit})</option>`;
        });
        select.innerHTML = optionsHtml;
    });
}

// CREATE MENU ITEM
async function handleCreateMenuItem(e) {
    e.preventDefault();
    const name = document.getElementById('menu-name').value;
    const price = document.getElementById('menu-price').value;
    const category = document.getElementById('menu-category').value;
    const imageUrl = document.getElementById('menu-image').value;

    // Gather ingredients
    const ingredientRows = document.querySelectorAll('.ingredient-input-row');
    const ingredients = [];
    
    ingredientRows.forEach(row => {
        const id = row.querySelector('.recipe-ing-select').value;
        const qty = row.querySelector('.recipe-ing-qty').value;
        if (id && qty) {
            ingredients.push({
                inventory_id: parseInt(id),
                quantity_needed: parseFloat(qty)
            });
        }
    });

    try {
        const res = await fetch(`${API_BASE}/api/menu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                price: parseFloat(price),
                category,
                image_url: imageUrl,
                ingredients
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(`Menu item '${name}' created successfully`, 'success');
        createMenuForm.reset();
        recipeIngredientsContainer.innerHTML = '';
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
