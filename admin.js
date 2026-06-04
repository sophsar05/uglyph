// =============================================================================
// UGLYPH ADMIN TERMINAL
// =============================================================================
//
// REQUIRED SUPABASE SETUP (run once in Supabase SQL Editor):
//
//   -- Already exists in your schema (confirmed):
//   --   manifests: receipt_url, payment_method, status, supplier_id
//   --   products: crate_code, brand_name, market_price, rescue_price, is_active
//   --   product_variants: product_id, type_name, stock_kg
//   --   suppliers: id, business_name, contact_number, status
//
//   -- Still need to add to 'products' table:
//   ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
//   ALTER TABLE products ADD COLUMN IF NOT EXISTS max_qty_per_customer INTEGER DEFAULT 0;
//
//   -- Create events table:
//   CREATE TABLE IF NOT EXISTS events (
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     title TEXT NOT NULL,
//     description TEXT,
//     event_date TIMESTAMPTZ,
//     location TEXT,
//     image_url TEXT,
//     is_active BOOLEAN DEFAULT TRUE,
//     created_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE events ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "events_public_read" ON events FOR SELECT USING (true);
//   CREATE POLICY "events_admin_all" ON events USING (auth.jwt() ->> 'role' = 'admin');
//
//   -- Grant admin role: Supabase Dashboard → Authentication → Users
//   -- → select admin user → "Edit" → app_metadata: { "role": "admin" }
//
// =============================================================================

const SUPABASE_URL = 'https://wjrtoyvztjmvlptobxgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqcnRveXZ6dGptdmxwdG9ieGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzY0NDksImV4cCI6MjA5NDMxMjQ0OX0.BCMgSBdFuVWdSOopRA6bGp6JElxkNzgYSCWCWN7H1U4';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Status progression for orders
const NEXT_STATUS = {
    'PENDING':   { label: 'VERIFY ORDER',   next: 'VERIFIED',  cls: 'btn-verify' },
    'VERIFIED':  { label: 'MARK PACKAGING', next: 'PACKAGING', cls: 'btn-packaging' },
    'PACKAGING': { label: 'MARK SHIPPING',  next: 'SHIPPING',  cls: 'btn-shipping' },
    'SHIPPING':  { label: 'MARK DELIVERED', next: 'DELIVERED', cls: 'btn-delivered' },
};

// =============================================================================
// INIT
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
        await checkAdminAccess(session.user);
    } else {
        show('authGate');
    }

    _sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) await checkAdminAccess(session.user);
        if (event === 'SIGNED_OUT') { show('authGate'); hideAll(); }
    });
});

async function checkAdminAccess(user) {
    // Primary check: app_metadata role set via Supabase Dashboard
    if (user.app_metadata?.role === 'admin') {
        bootAdmin(user); return;
    }
    // Fallback: suppliers table status field
    const { data } = await _sb.from('suppliers').select('status').eq('id', user.id).maybeSingle();
    if (data?.status === 'admin') {
        bootAdmin(user); return;
    }
    hide('authGate');
    show('accessDenied');
}

function bootAdmin(user) {
    hide('authGate');
    hide('accessDenied');
    document.getElementById('adminPanel').style.display = 'flex';
    document.getElementById('adminUserDisplay').textContent = user.email;
    // Avatar initial
    const avatarEl = document.getElementById('userAvatarInitial');
    if (avatarEl) avatarEl.textContent = user.email[0].toUpperCase();
    initTabs();
    loadDashboard();
    loadProducts();
    loadEvents();

    document.getElementById('refreshOrdersBtn').addEventListener('click', () => {
        loadOrders(document.getElementById('orderStatusFilter').value);
    });
}

// Mobile sidebar
window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
};
window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
};

// =============================================================================
// AUTH FORM
// =============================================================================

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPassword').value;
    const statusEl = document.getElementById('authStatus');
    statusEl.textContent = 'Signing in...';
    statusEl.className = 'auth-feedback loading';

    const { error } = await _sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
        statusEl.textContent = error.message;
        statusEl.className = 'auth-feedback error';
    }
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => _sb.auth.signOut());
document.getElementById('deniedLogoutBtn').addEventListener('click', () => _sb.auth.signOut());

// =============================================================================
// TABS
// =============================================================================

const PAGE_TITLES = { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', events: 'Events' };

function initTabs() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
            closeSidebar();
        });
    });
}

window.switchTab = function(tabName) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (navBtn) navBtn.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = PAGE_TITLES[tabName] || tabName;
    if (tabName === 'orders') loadOrders(document.getElementById('orderStatusFilter').value);
};

window.filterOrders = function(status, btn) {
    document.getElementById('orderStatusFilter').value = status;
    document.querySelectorAll('.pipeline-step').forEach(s => s.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadOrders(status);
};

// =============================================================================
// DASHBOARD
// =============================================================================

async function loadDashboard() {
    const tsEl = document.getElementById('dashTimestamp');
    if (tsEl) tsEl.textContent =
        `LAST UPDATED: ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`;

    const [ordersRes, productsRes] = await Promise.all([
        _sb.from('manifests').select('id, status, total_amount, created_at').neq('status', 'DRAFT'),
        _sb.from('products').select('id, is_active')
    ]);

    if (ordersRes.data) {
        const orders = ordersRes.data;
        const pending = orders.filter(o => o.status === 'PENDING');
        const confirmed = orders.filter(o => ['VERIFIED','PACKAGING','SHIPPING','DELIVERED'].includes(o.status));
        const revenue = confirmed.reduce((sum, o) => sum + (o.total_amount || 0), 0);

        document.getElementById('kpiTotal').textContent = orders.length;
        document.getElementById('kpiPending').textContent = pending.length;
        document.getElementById('kpiRevenue').textContent = `₱${revenue.toLocaleString()}`;

        const badge = document.getElementById('pendingBadge');
        badge.textContent = pending.length;
        badge.style.display = pending.length > 0 ? 'inline-flex' : 'none';
    }

    if (productsRes.data) {
        document.getElementById('kpiProducts').textContent =
            productsRes.data.filter(p => p.is_active).length;
    }

    loadRecentOrders();
}

async function loadRecentOrders() {
    let { data, error } = await _sb
        .from('manifests')
        .select('id, total_amount, status, created_at, suppliers(business_name)')
        .neq('status', 'DRAFT')
        .order('created_at', { ascending: false })
        .limit(8);

    // Fallback without the join if it fails (e.g. missing FK relationship)
    if (error) {
        ({ data, error } = await _sb
            .from('manifests')
            .select('id, total_amount, status, created_at')
            .neq('status', 'DRAFT')
            .order('created_at', { ascending: false })
            .limit(8));
    }

    const container = document.getElementById('recentOrdersList');
    if (error || !data || data.length === 0) {
        container.innerHTML = '<div class="empty-state mono-font">> NO ORDERS YET</div>';
        return;
    }

    container.innerHTML = data.map(o => `
        <div class="recent-row">
            <div style="flex:1; min-width:0;">
                <div class="recent-customer">${o.suppliers?.business_name || 'Customer'}</div>
                <div class="recent-id">#${o.id.slice(0,8).toUpperCase()} · ${formatDate(o.created_at)}</div>
            </div>
            <span class="recent-amount">₱${(o.total_amount || 0).toLocaleString()}</span>
            <span class="badge badge-${o.status}">${o.status}</span>
        </div>`).join('');
}

// =============================================================================
// PRODUCTS
// =============================================================================

async function loadProducts() {
    document.getElementById('productsLoading').style.display = 'block';
    document.getElementById('productsTable').style.display = 'none';

    const { data, error } = await _sb
        .from('products')
        .select('id, crate_code, brand_name, description, market_price, rescue_price, is_active, image_url, max_qty_per_customer, product_variants(id, type_name, stock_kg)')
        .order('brand_name');

    document.getElementById('productsLoading').style.display = 'none';

    if (error) { showToast('Error loading products: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) {
        document.getElementById('productsLoading').textContent = '> NO PRODUCTS FOUND. ADD ONE ABOVE.';
        document.getElementById('productsLoading').style.display = 'block';
        return;
    }

    document.getElementById('productsTable').style.display = 'table';
    const tbody = document.getElementById('productsTableBody');
    const disc = (m, r) => m > 0 ? Math.round(((m - r) / m) * 100) : 0;

    tbody.innerHTML = data.map(p => `
        <tr>
            <td>
                <div class="cell-product-name">${p.brand_name}</div>
                <div class="cell-product-sub">${p.crate_code || ''}${p.crate_code && p.description ? ' · ' : ''}${p.description ? p.description.slice(0,40) + (p.description.length > 40 ? '…' : '') : ''}</div>
            </td>
            <td class="cell-price">₱${p.market_price}</td>
            <td class="cell-surplus">₱${p.rescue_price}</td>
            <td class="cell-discount">-${disc(p.market_price, p.rescue_price)}%</td>
            <td style="font-size:13px; color:var(--text-2);">${(p.max_qty_per_customer || 0) > 0 ? p.max_qty_per_customer + ' kg' : '—'}</td>
            <td style="font-size:12px; color:var(--text-2);">${(p.product_variants || []).map(v => `${v.type_name} (${v.stock_kg}kg)`).join(', ') || '—'}</td>
            <td><span class="badge badge-${p.is_active ? 'ACTIVE' : 'INACTIVE'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <div class="row-actions">
                    <button class="row-btn row-btn-edit" onclick="editProduct('${p.id}')">Edit</button>
                    <button class="row-btn" onclick="toggleProduct('${p.id}', ${p.is_active})">${p.is_active ? 'Deactivate' : 'Activate'}</button>
                </div>
            </td>
        </tr>`).join('');
}

// --- Product Form ---

document.getElementById('addProductBtn').addEventListener('click', () => openProductForm());
document.getElementById('closeProductForm').addEventListener('click', hideProductForm);
document.getElementById('cancelProductBtn').addEventListener('click', hideProductForm);
document.getElementById('addVariantRowBtn').addEventListener('click', addVariantRow);
document.getElementById('saveProductBtn').addEventListener('click', saveProduct);

// Auto-calculate surplus price when regular price or discount % changes
document.getElementById('pMarketPrice').addEventListener('input', calcSurplus);
document.getElementById('pDiscountPct').addEventListener('input', calcSurplus);

function calcSurplus() {
    const regular = parseFloat(document.getElementById('pMarketPrice').value);
    const pct = parseFloat(document.getElementById('pDiscountPct').value);
    if (!isNaN(regular) && !isNaN(pct) && pct > 0 && pct < 100) {
        document.getElementById('pRescuePrice').value = (regular * (1 - pct / 100)).toFixed(2);
    }
}

function openProductForm(product = null) {
    clearProductForm();
    if (product) {
        document.getElementById('productFormTitle').textContent = `Edit Product`;
        document.getElementById('editProductId').value = product.id;
        document.getElementById('pName').value = product.brand_name || '';
        document.getElementById('pCrateCode').value = product.crate_code || '';
        document.getElementById('pDesc').value = product.description || '';
        document.getElementById('pImage').value = product.image_url || '';
        document.getElementById('pMarketPrice').value = product.market_price || '';
        document.getElementById('pRescuePrice').value = product.rescue_price || '';
        document.getElementById('pMaxQty').value = product.max_qty_per_customer || 0;
        document.getElementById('pIsActive').checked = product.is_active;
        (product.product_variants || []).forEach(v => addVariantRow(v.type_name, v.stock_kg));
    } else {
        addVariantRow(); // Start with one blank variant
    }
    document.getElementById('productForm').style.display = 'block';
    document.getElementById('productForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.editProduct = async function(id) {
    const { data, error } = await _sb
        .from('products')
        .select('id, crate_code, brand_name, description, market_price, rescue_price, is_active, image_url, max_qty_per_customer, product_variants(id, type_name, stock_kg)')
        .eq('id', id)
        .single();
    if (error) { showToast('Error loading product', 'error'); return; }
    openProductForm(data);
};

function hideProductForm() {
    document.getElementById('productForm').style.display = 'none';
    clearProductForm();
}

function clearProductForm() {
    document.getElementById('editProductId').value = '';
    document.getElementById('productFormTitle').textContent = 'ADD NEW PRODUCT';
    ['pName','pCrateCode','pDesc','pImage','pMarketPrice','pDiscountPct','pRescuePrice'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('pMaxQty').value = 0;
    document.getElementById('pIsActive').checked = true;
    document.getElementById('variantsContainer').innerHTML = '';
    document.getElementById('productSaveStatus').textContent = '';
    document.getElementById('productSaveStatus').className = 'mono-font save-status';
}

function addVariantRow(typeName = '', stockKg = '') {
    const container = document.getElementById('variantsContainer');

    if (container.children.length === 0) {
        container.insertAdjacentHTML('beforebegin',
            `<div class="variant-labels">
                <span class="variant-label">TYPE NAME</span>
                <span class="variant-label">STOCK (KG)</span>
                <span class="variant-label"></span>
             </div>`);
    }

    const row = document.createElement('div');
    row.className = 'variant-row';
    row.innerHTML = `
        <input type="text" class="variant-type field-input" placeholder="e.g. Regular Pack" value="${typeName}">
        <input type="number" class="variant-stock field-input" placeholder="0" value="${stockKg}" min="0" step="0.1">
        <button type="button" class="remove-variant" onclick="this.closest('.variant-row').remove()">✕</button>
    `;
    container.appendChild(row);
}

async function saveProduct() {
    const statusEl = document.getElementById('productSaveStatus');
    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('pName').value.trim();
    const marketPrice = parseFloat(document.getElementById('pMarketPrice').value);
    const rescuePrice = parseFloat(document.getElementById('pRescuePrice').value);

    if (!name || isNaN(marketPrice) || isNaN(rescuePrice)) {
        statusEl.textContent = '[ERROR] NAME, REGULAR PRICE, AND SURPLUS PRICE ARE REQUIRED';
        statusEl.className = 'mono-font save-status error';
        return;
    }

    const productData = {
        brand_name: name.toUpperCase(),
        crate_code: document.getElementById('pCrateCode').value.trim().toUpperCase() || null,
        description: document.getElementById('pDesc').value.trim() || null,
        market_price: marketPrice,
        rescue_price: rescuePrice,
        is_active: document.getElementById('pIsActive').checked,
        image_url: document.getElementById('pImage').value.trim() || null,
        max_qty_per_customer: parseInt(document.getElementById('pMaxQty').value) || 0,
    };

    statusEl.textContent = 'SAVING...';
    statusEl.className = 'mono-font save-status';

    let savedId = id;

    if (id) {
        const { error } = await _sb.from('products').update(productData).eq('id', id);
        if (error) { statusEl.textContent = `[ERROR] ${error.message}`; statusEl.className = 'mono-font save-status error'; return; }
    } else {
        const { data, error } = await _sb.from('products').insert(productData).select().single();
        if (error) { statusEl.textContent = `[ERROR] ${error.message}`; statusEl.className = 'mono-font save-status error'; return; }
        savedId = data.id;
    }

    // Save variants
    await _sb.from('product_variants').delete().eq('product_id', savedId);
    const variantRows = document.querySelectorAll('#variantsContainer .variant-row');
    const variants = Array.from(variantRows)
        .map(row => ({
            product_id: savedId,
            type_name: row.querySelector('.variant-type').value.trim().toUpperCase(),
            stock_kg: parseFloat(row.querySelector('.variant-stock').value) || 0
        }))
        .filter(v => v.type_name);

    if (variants.length > 0) {
        const { error: vErr } = await _sb.from('product_variants').insert(variants);
        if (vErr) { statusEl.textContent = `[WARN] Product saved but variants failed: ${vErr.message}`; statusEl.className = 'mono-font save-status error'; }
    }

    statusEl.textContent = `✓ PRODUCT ${id ? 'UPDATED' : 'CREATED'} SUCCESSFULLY`;
    statusEl.className = 'mono-font save-status success';
    showToast(`Product ${id ? 'updated' : 'created'}!`, 'success');
    loadProducts();
    setTimeout(hideProductForm, 1500);
}

window.toggleProduct = async function(id, currentlyActive) {
    const { error } = await _sb.from('products').update({ is_active: !currentlyActive }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(`Product ${currentlyActive ? 'deactivated' : 'activated'}`, 'success');
    loadProducts();
};

// =============================================================================
// ORDERS
// =============================================================================

async function loadOrders(statusFilter = 'PENDING') {
    const container = document.getElementById('ordersContainer');
    container.innerHTML = `<div class="empty-state"><div class="skeleton-list"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div></div>`;

    let query = _sb
        .from('manifests')
        .select(`
            id, created_at, total_amount, status, payment_method, receipt_url,
            customer_name, delivery_address,
            supplier_id,
            suppliers (business_name, contact_number)
        `)
        .neq('status', 'DRAFT')
        .order('created_at', { ascending: false });

    if (statusFilter !== 'ALL') query = query.eq('status', statusFilter);

    const { data, error } = await query;

    updatePipelineCounts();

    if (error) {
        container.innerHTML = `<div class="empty-state" style="color:var(--red);">Error: ${error.message}</div>`;
        return;
    }
    if (!data || data.length === 0) {
        const label = statusFilter === 'ALL' ? 'orders' : `${statusFilter.toLowerCase()} orders`;
        container.innerHTML = `<div class="empty-state"><p>No ${label} found.</p></div>`;
        return;
    }

    // Fetch items separately to avoid FK join issues
    const ids = data.map(o => o.id);
    const { data: itemsData, error: itemsErr } = await _sb
        .from('manifest_items')
        .select('manifest_id, quantity_kg, price_at_time, line_total, product_variant_id, product_variants (type_name, products (brand_name))')
        .in('manifest_id', ids);

    if (itemsErr) console.error('manifest_items error:', itemsErr);

    // Attach items to their parent order
    data.forEach(order => {
        order.manifest_items = itemsData ? itemsData.filter(i => i.manifest_id === order.id) : [];
    });

    container.innerHTML = `<div class="orders-list">${data.map(renderOrderCard).join('')}</div>`;
}

async function updatePipelineCounts() {
    const { data } = await _sb.from('manifests').select('status').neq('status', 'DRAFT');
    if (!data) return;
    ['PENDING','VERIFIED','PACKAGING','SHIPPING','DELIVERED'].forEach(s => {
        const el = document.getElementById(`cnt-${s}`);
        if (el) el.textContent = data.filter(o => o.status === s).length;
    });
    const pending = data.filter(o => o.status === 'PENDING').length;
    const badge = document.getElementById('pendingBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-flex' : 'none'; }
}

function parseDeliveryAddress(raw) {
    if (!raw) return { address: '—', contact: '—', gcash: '—' };
    const parts = raw.split(' | GCash Ref: ');
    const gcash = parts[1] ? parts[1].trim() : '—';
    const addrContact = parts[0] || '';
    const contactMatch = addrContact.match(/\(Contact:\s*(.+?)\)\s*$/);
    const contact = contactMatch ? contactMatch[1].trim() : '—';
    const address = addrContact.replace(/\s*\(Contact:\s*.+?\)\s*$/, '').trim();
    return { address: address || '—', contact: contact || '—', gcash: gcash || '—' };
}

function renderOrderCard(order) {
    const customer = order.suppliers || {};
    const items = order.manifest_items || [];
    const name = order.customer_name || customer.business_name || 'Unknown Customer';
    const initials = name.slice(0, 2).toUpperCase();
    const info = parseDeliveryAddress(order.delivery_address);

    return `<div class="order-card" id="order-${order.id}">
        <div class="order-card-top">
            <div class="order-header-left">
                <span class="order-num">#${order.id.slice(0,8).toUpperCase()}</span>
                <span class="order-date">${formatDate(order.created_at)}</span>
            </div>
            <div class="order-header-right">
                <span class="payment-tag">${(order.payment_method || '—').replace(/_/g,' ')}</span>
                <span class="badge badge-${order.status}">${order.status}</span>
            </div>
        </div>
        <div class="order-card-body">
            <div class="order-customer-row">
                <div class="order-avatar">${initials}</div>
                <div class="order-customer-details">
                    <div class="order-customer-name">${name}</div>
                    <div class="order-info-grid">
                        <span class="order-info-label">Orders</span><span class="order-info-val">${items.map(item => { const pv = item.product_variants || {}; const p = pv.products || {}; return `${p.brand_name || '—'} · ${pv.type_name || ''} · ${item.quantity_kg}kg`; }).join('<br>') || '—'}</span>
                        <span class="order-info-label">Contact</span><span class="order-info-val">${info.contact}</span>
                        <span class="order-info-label">Address</span><span class="order-info-val">${info.address}</span>
                        <span class="order-info-label">GCash Ref</span><span class="order-info-val">${info.gcash}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="order-card-footer">
            <div>
                <span class="order-total-label">Total</span>
                <span class="order-total">₱${(order.total_amount || 0).toLocaleString()}</span>
            </div>
            <div class="order-actions">
                <button class="order-action oa-receipt" onclick="viewReceipt('${order.id}','${order.receipt_url || ''}','${order.payment_method || ''}','${order.status}')">View Receipt</button>
                ${{ 'VERIFIED': `<button class="order-action oa-packaging" onclick="updateOrderStatus('${order.id}','PACKAGING',this)">Move to Packaging</button>`,
                    'PACKAGING': `<button class="order-action oa-shipping"  onclick="updateOrderStatus('${order.id}','SHIPPING',this)">Move to Shipping</button>`,
                    'SHIPPING':  `<button class="order-action oa-delivered" onclick="updateOrderStatus('${order.id}','DELIVERED',this)">Mark Delivered</button>`,
                  }[order.status] || ''}
            </div>
        </div>
    </div>`;
}

window.updateOrderStatus = async function(manifestId, newStatus, btn) {
    const btnLabel = btn ? btn.textContent : newStatus;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const { error } = await _sb.from('manifests').update({ status: newStatus }).eq('id', manifestId);
    if (error) {
        showToast('Error: ' + error.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
        return;
    }

    // Verify the update actually stuck (catches silent RLS blocks)
    const { data: verify } = await _sb
        .from('manifests').select('status').eq('id', manifestId).maybeSingle();

    if (verify && verify.status !== newStatus) {
        showToast('Permission denied — add an admin UPDATE policy on manifests in Supabase SQL Editor', 'error');
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
        return;
    }

    showToast(`Order → ${newStatus}`, 'success');
    document.getElementById('receiptModal').style.display = 'none';
    loadOrders(document.getElementById('orderStatusFilter').value);
    loadDashboard();
};

// =============================================================================
// RECEIPT MODAL
// =============================================================================

window.viewReceipt = function(orderId, receiptUrl, paymentMethod, status) {
    const modal = document.getElementById('receiptModal');
    const img = document.getElementById('receiptImg');
    const noImg = document.getElementById('receiptNoImg');
    const info = document.getElementById('receiptOrderInfo');
    const actions = document.getElementById('receiptActions');

    info.textContent = `ORDER #${orderId.slice(0,8).toUpperCase()} · ${(paymentMethod || '').replace(/_/g,' ')}`;

    if (receiptUrl && receiptUrl !== 'null' && receiptUrl !== '') {
        img.src = receiptUrl;
        img.style.display = 'block';
        noImg.style.display = 'none';
    } else {
        img.style.display = 'none';
        noImg.style.display = 'block';
    }

    if (status === 'PENDING') {
        actions.innerHTML = `
            <button class="order-action oa-verified" onclick="updateOrderStatus('${orderId}','VERIFIED',this)">Verify Order</button>
            <button class="order-action oa-reject"   onclick="updateOrderStatus('${orderId}','REJECTED',this)">Reject</button>
        `;
        actions.style.display = 'flex';
    } else {
        actions.innerHTML = '';
        actions.style.display = 'none';
    }

    modal.style.display = 'flex';
};

window.closeReceiptModal = function(e) {
    if (e.target === document.getElementById('receiptModal')) {
        document.getElementById('receiptModal').style.display = 'none';
    }
};

// =============================================================================
// EVENTS
// =============================================================================

async function loadEvents() {
    document.getElementById('eventsLoading').style.display = 'block';
    document.getElementById('eventsGrid').innerHTML = '';

    const { data, error } = await _sb
        .from('events')
        .select('*')
        .order('event_date', { ascending: false });

    document.getElementById('eventsLoading').style.display = 'none';

    if (error) {
        const el = document.getElementById('eventsLoading');
        el.innerHTML = error.code === '42P01'
            ? `<p>Events table not found. Run the setup SQL in admin.js to create it.</p>`
            : `<p style="color:var(--red)">Error: ${error.message}</p>`;
        el.style.display = 'flex';
        return;
    }
    if (!data || data.length === 0) {
        document.getElementById('eventsLoading').innerHTML = '<p>No events yet. Add one to get started.</p>';
        document.getElementById('eventsLoading').style.display = 'flex';
        return;
    }

    document.getElementById('eventsLoading').style.display = 'none';
    const grid = document.getElementById('eventsGrid');
    grid.innerHTML = data.map(ev => `
        <div class="event-card">
            <div class="event-img" ${ev.image_url ? `style="background-image:url('${ev.image_url}')"` : ''}>
                ${!ev.image_url ? `<div class="event-img-placeholder">EVENT</div>` : ''}
                <span class="badge badge-${ev.is_active ? 'ACTIVE' : 'INACTIVE'}">${ev.is_active ? 'Published' : 'Draft'}</span>
            </div>
            <div class="event-body">
                <div class="event-title">${ev.title}</div>
                <div class="event-meta">${ev.event_date ? formatDate(ev.event_date) : ''}${ev.location ? ' · ' + ev.location : ''}</div>
                ${ev.description ? `<div class="event-desc">${ev.description}</div>` : ''}
            </div>
            <div class="event-footer">
                <button class="row-btn row-btn-edit" onclick="editEvent('${ev.id}')">Edit</button>
                <button class="row-btn" onclick="toggleEvent('${ev.id}', ${ev.is_active})">${ev.is_active ? 'Unpublish' : 'Publish'}</button>
                <button class="row-btn row-btn-danger" onclick="deleteEvent('${ev.id}')">Delete</button>
            </div>
        </div>`).join('');
}

// --- Event Form ---

document.getElementById('addEventBtn').addEventListener('click', () => openEventForm());
document.getElementById('closeEventForm').addEventListener('click', hideEventForm);
document.getElementById('cancelEventBtn').addEventListener('click', hideEventForm);
document.getElementById('saveEventBtn').addEventListener('click', saveEvent);

function openEventForm(event = null) {
    clearEventForm();
    if (event) {
        document.getElementById('eventFormTitle').textContent = `EDIT: ${event.title}`;
        document.getElementById('editEventId').value = event.id;
        document.getElementById('eName').value = event.title || '';
        document.getElementById('eDesc').value = event.description || '';
        document.getElementById('eDate').value = event.event_date ? event.event_date.slice(0, 16) : '';
        document.getElementById('eLocation').value = event.location || '';
        document.getElementById('eImage').value = event.image_url || '';
        document.getElementById('eIsActive').checked = event.is_active;
    }
    document.getElementById('eventForm').style.display = 'block';
    document.getElementById('eventForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.editEvent = async function(id) {
    const { data, error } = await _sb.from('events').select('*').eq('id', id).single();
    if (error) { showToast('Error loading event', 'error'); return; }
    openEventForm(data);
};

function hideEventForm() {
    document.getElementById('eventForm').style.display = 'none';
    clearEventForm();
}

function clearEventForm() {
    document.getElementById('editEventId').value = '';
    document.getElementById('eventFormTitle').textContent = 'ADD NEW EVENT';
    ['eName','eDesc','eDate','eLocation','eImage'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('eIsActive').checked = true;
    document.getElementById('eventSaveStatus').textContent = '';
}

async function saveEvent() {
    const statusEl = document.getElementById('eventSaveStatus');
    const id = document.getElementById('editEventId').value;
    const title = document.getElementById('eName').value.trim();
    const date = document.getElementById('eDate').value;

    if (!title || !date) {
        statusEl.textContent = '[ERROR] TITLE AND DATE ARE REQUIRED';
        statusEl.className = 'mono-font save-status error';
        return;
    }

    const eventData = {
        title: title.toUpperCase(),
        description: document.getElementById('eDesc').value.trim() || null,
        event_date: new Date(date).toISOString(),
        location: document.getElementById('eLocation').value.trim() || null,
        image_url: document.getElementById('eImage').value.trim() || null,
        is_active: document.getElementById('eIsActive').checked,
    };

    statusEl.textContent = 'SAVING...';
    statusEl.className = 'mono-font save-status';

    const { error } = id
        ? await _sb.from('events').update(eventData).eq('id', id)
        : await _sb.from('events').insert(eventData);

    if (error) {
        statusEl.textContent = `[ERROR] ${error.message}`;
        statusEl.className = 'mono-font save-status error';
        return;
    }

    statusEl.textContent = `✓ EVENT ${id ? 'UPDATED' : 'CREATED'}`;
    statusEl.className = 'mono-font save-status success';
    showToast(`Event ${id ? 'updated' : 'created'}!`, 'success');
    loadEvents();
    setTimeout(hideEventForm, 1200);
}

window.toggleEvent = async function(id, current) {
    const { error } = await _sb.from('events').update({ is_active: !current }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(`Event ${current ? 'unpublished' : 'published'}`, 'success');
    loadEvents();
};

window.deleteEvent = async function(id) {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    const { error } = await _sb.from('events').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Event deleted', 'success');
    loadEvents();
};

// =============================================================================
// UTILITIES
// =============================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('adminToastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function hideAll() {
    ['authGate','accessDenied','adminPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}
