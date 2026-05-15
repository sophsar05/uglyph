// --- CONFIGURATION ---
const SUPABASE_URL = 'https://wjrtoyvztjmvlptobxgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqcnRveXZ6dGptdmxwdG9ieGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzY0NDksImV4cCI6MjA5NDMxMjQ0OX0.BCMgSBdFuVWdSOopRA6bGp6JElxkNzgYSCWCWN7H1U4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM ELEMENTS ---
const productGrid = document.getElementById('productGrid');
const manifestItemsContainer = document.getElementById('manifestItems');
const manifestTotalEl = document.getElementById('manifestTotal');
const cartCounterEl = document.getElementById('cartCounter');

const sharedOverlay = document.getElementById('sharedOverlay');
const loginBtn = document.getElementById('openLoginBtn');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const statusText = document.getElementById('loginStatus');

// Auth Toggle Elements
const authTitle = document.getElementById('authTitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggle = document.getElementById('authToggle');
const signupFields = document.getElementById('signupFields'); // Added for Supplier details

const openManifestBtn = document.getElementById('openManifestBtn');
const closeManifestBtn = document.getElementById('closeManifestBtn');
const manifestSidebar = document.getElementById('manifestSidebar');
const sealManifestBtn = document.getElementById('sealManifestBtn');

// --- NEW: DYNAMIC PAYMENT MODAL ---
let paymentModal = document.getElementById('paymentModal');
if (!paymentModal) {
    paymentModal = document.createElement('div');
    paymentModal.id = 'paymentModal';
    // Applied generic modal styling inline to ensure it displays correctly without relying on external CSS classes
    paymentModal.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:1001; background:#000; border:2px solid var(--yellow, #f1c40f); padding:30px; width:90%; max-width:400px; text-align:center;";
    paymentModal.innerHTML = `
        <h2 class="brand-font" style="color:var(--yellow, #f1c40f); margin-bottom:20px;">SELECT PAYMENT METHOD</h2>
        <div class="payment-options" style="display:flex; flex-direction:column; gap:15px;">
            <button class="btn-dark payment-choice" style="padding:15px; border:1px solid #444; background:#111; color:white; cursor:pointer;" data-method="GCASH">GCASH</button>
            <button class="btn-dark payment-choice" style="padding:15px; border:1px solid #444; background:#111; color:white; cursor:pointer;" data-method="CASH_ON_DELIVERY">CASH ON DELIVERY (COD)</button>
            <button class="btn-dark payment-choice" style="padding:15px; border:1px solid #444; background:#111; color:white; cursor:pointer;" data-method="BANK_TRANSFER">BANK TRANSFER</button>
            <button class="btn-dark payment-choice" style="padding:15px; border:1px solid #444; background:#111; color:white; cursor:pointer;" data-method="CARD">CREDIT/DEBIT CARD</button>
        </div>
        <button id="cancelPayment" class="mono-font" style="background:none; border:none; color:gray; margin-top:20px; cursor:pointer;">[ CANCEL ]</button>
    `;
    document.body.appendChild(paymentModal);
}

// --- NEW: DYNAMIC TOAST & PRODUCT DETAILS UI ---
const toastContainer = document.createElement('div');
toastContainer.style.cssText = "position:fixed; bottom:30px; left:50%; transform:translateX(-50%); z-index:9999; display:flex; flex-direction:column; gap:10px; pointer-events:none;";
document.body.appendChild(toastContainer);

window.showToast = function(message) {
    const toast = document.createElement('div');
    toast.className = "mono-font";
    toast.style.cssText = "background:var(--yellow, #f1c40f); color:#000; padding:12px 24px; border-radius:30px; font-weight:bold; box-shadow:0 4px 10px rgba(0,0,0,0.5); transition: opacity 0.3s, transform 0.3s; opacity:0; transform:translateY(20px); text-align:center;";
    toast.innerText = message;
    
    toastContainer.appendChild(toast);
    
    // Animate In
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    // Animate Out & Remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
};

let detailsModal = document.createElement('div');
detailsModal.id = 'detailsModal';
detailsModal.style.cssText = "display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:1001; background:#111; border:2px solid var(--yellow, #f1c40f); padding:30px; width:90%; max-width:400px; text-align:left; color:white;";
document.body.appendChild(detailsModal);

window.openProductDetails = function(productId) {
    const product = availableInventory.find(p => p.id === productId);
    if (!product) return;
    
    detailsModal.innerHTML = `
        <h2 class="brand-font" style="color:var(--yellow, #f1c40f); margin-bottom:10px;">${product.brand_name}</h2>
        <p class="mono-font" style="font-size:14px; color:#aaa; margin-bottom:20px;">
            ${product.description || 'No description available for this surplus batch.'}
        </p>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px;" class="mono-font">
            <div><span style="opacity:0.5; font-size:12px;">MARKET</span><br><s style="color:red;">₱${product.market_price}</s></div>
            <div><span style="opacity:0.5; font-size:12px;">SURPLUS</span><br><b style="color:var(--yellow, #f1c40f); font-size:18px;">₱${product.rescue_price}</b></div>
        </div>
        <button onclick="closeAllOverlays()" class="btn-dark btn-full mono-font" style="padding:10px; width:100%; border:1px solid #444; background:#222; color:white; cursor:pointer;">[ CLOSE ]</button>
    `;
    
    sharedOverlay.classList.add('active');
    detailsModal.style.display = 'block';
};

// --- STATE ---
let manifest = [];
let availableInventory = [];
let isLoginMode = true; // Tracks if we are in Login or Signup mode

// --- 1. INVENTORY: FETCH & DYNAMIC RENDERING ---

async function fetchInventory() {
    const { data, error } = await _supabase
        .from('product_variants')
        .select(`
            id, 
            type_name, 
            stock_kg,
            products (id, brand_name, rescue_price, market_price, description)
        `)
        .eq('products.is_active', true);

    if (error) {
        console.error("Error fetching inventory:", error);
        return;
    }
    
    const grouped = data.reduce((acc, item) => {
        const pId = item.products.id;
        if (!acc[pId]) {
            acc[pId] = { ...item.products, variants: [] };
        }
        acc[pId].variants.push({ id: item.id, type_name: item.type_name });
        return acc;
    }, {});

    availableInventory = Object.values(grouped);
    renderProductCards();
}


// NEW: Toggle function for mobile
window.toggleMobileDetails = function(cardElement) {
    const details = cardElement.querySelector('.expandable-details');
    if (details.style.display === 'none' || details.style.display === '') {
        details.style.display = 'block';
    } else {
        details.style.display = 'none';
    }
};

function renderProductCards() {
    if (!productGrid) return;
    productGrid.innerHTML = availableInventory.map(product => {
        const discount = Math.round(((product.market_price - product.rescue_price) / product.market_price) * 100);
        return `
            <div class="product-card" onclick="toggleMobileDetails(this)" style="cursor:pointer;">
                <div class="card-img-wrap">
                    <span class="badge-right">-${discount}%</span>
                    <div class="product-placeholder brand-font" style="display:flex; align-items:center; justify-content:center; height:180px; background:#111; color:var(--yellow); font-size:40px;">
                        ${product.brand_name.split(' ')[0]}
                    </div>
                    <span class="price-tag">₱${product.rescue_price} / KG</span>
                </div>
                <div class="card-body">
                    <h3 class="product-name brand-font">${product.brand_name}</h3>
                    
                    <div class="expandable-details" style="display: none; margin-top: 15px;">
                        <div class="pricing-grid">
                            <div class="price-box">
                                <span class="p-label">REGULAR PRICE</span>
                                <span class="p-value" style="text-decoration: line-through; opacity: 0.5;">₱${product.market_price}</span>
                            </div>
                            <div class="price-box highlight">
                                <span class="p-label">SURPLUS PRICE</span>
                                <span class="p-value">₱${product.rescue_price}</span>
                            </div>
                        </div>
                        <div class="select-grid" style="margin-top: 15px;">
                            <select class="variant-select mono-font" onclick="event.stopPropagation()">
                                ${product.variants.map(v => `<option value="${v.id}">${v.type_name}</option>`).join('')}
                            </select>
                            <select class="weight-select mono-font" onclick="event.stopPropagation()">
                                <option value="1">1 KG</option>
                                <option value="5">5 KG</option>
                                <option value="10">10 KG</option>
                                <option value="25">25 KG</option>
                            </select>
                        </div>
                        <button class="btn-dark btn-full" style="margin-top: 15px;" onclick="event.stopPropagation(); addToManifest('${product.id}', this)">
                            ADD TO MANIFEST ->
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// --- 2. MANIFEST CORE LOGIC ---

window.addToManifest = function(productId, button) {
    const card = button.closest('.product-card');
    const variantId = card.querySelector('.variant-select').value;
    const weight = parseInt(card.querySelector('.weight-select').value);
    const product = availableInventory.find(p => p.id === productId);
    const variant = product.variants.find(v => v.id === variantId);

    const existing = manifest.find(item => item.variantId === variantId);
    if (existing) {
        existing.weight += weight;
    } else {
        manifest.push({
            variantId: variant.id,
            type: `${product.brand_name} (${variant.type_name})`,
            weight: weight,
            price: product.rescue_price
        });
    }

    renderManifest();
    syncManifestToDB();
    
    // Trigger the floating bubble notification
    showToast(`+${weight}KG ${product.brand_name.split(' ')[0]} ADDED`);
};

function renderManifest() {
    if (!manifestItemsContainer) return;
    manifestItemsContainer.innerHTML = manifest.length ? manifest.map((item, index) => `
        <div class="manifest-item">
            <div class="manifest-item-title brand-font">> ITEM_${index + 1} // ${item.type}</div>
            <div class="manifest-item-details mono-font">
                <span>@ ₱${item.price}/KG</span>
                <span style="color: var(--white); font-weight: bold;">₱${item.weight * item.price}</span>
            </div>
            <div class="manifest-item-controls mono-font">
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                    <span class="qty-val">${item.weight} KG</span>
                    <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                </div>
                <button class="remove-btn" onclick="removeItem(${index})">REMOVE [X]</button>
            </div>
        </div>`).join('') : '<p class="mono-font" style="text-align:center; opacity:0.5; margin-top:50px;">MANIFEST EMPTY</p>';

    const total = manifest.reduce((s, i) => s + (i.price * i.weight), 0);
    manifestTotalEl.innerText = `₱${total}`;
    cartCounterEl.innerText = `(${manifest.length})`;
}

window.updateQty = function(index, change) {
    if (manifest[index].weight + change > 0) manifest[index].weight += change;
    else manifest.splice(index, 1);
    renderManifest();
    syncManifestToDB();
};

window.removeItem = function(index) {
    manifest.splice(index, 1);
    renderManifest();
    syncManifestToDB();
};

// --- 3. DATABASE SYNC & SEALING ---

async function syncManifestToDB() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const totalAmount = manifest.reduce((sum, item) => sum + (item.weight * item.price), 0);
    const { data: manifestRecord, error: mError } = await _supabase
        .from('manifests')
        .upsert({ supplier_id: user.id, total_amount: totalAmount, status: 'DRAFT' }, { onConflict: 'supplier_id' })
        .select().single();

    if (mError) return console.error("Sync Error:", mError);

    await _supabase.from('manifest_items').delete().eq('manifest_id', manifestRecord.id);
    if (manifest.length > 0) {
        const lineItems = manifest.map(item => ({
            manifest_id: manifestRecord.id,
            product_variant_id: item.variantId,
            quantity_kg: item.weight,
            price_at_time: item.price,
            line_total: item.weight * item.price
        }));
        await _supabase.from('manifest_items').insert(lineItems);
    }
}

// Open Payment Modal when Sealing
sealManifestBtn.addEventListener('click', async () => {
    if (manifest.length === 0) return alert("Manifest is empty.");
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return loginBtn.click();
    
    // Open Payment Modal
    paymentModal.style.display = 'block';
    sharedOverlay.classList.add('active');
});

// Handle Payment Method Selection
document.querySelectorAll('.payment-choice').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const paymentMethod = e.target.getAttribute('data-method');
        await finalizeManifest(paymentMethod);
    });
});

async function finalizeManifest(paymentMethod) {
    sealManifestBtn.innerText = "PROCESSING...";
    sealManifestBtn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        
        const { error: updateError } = await _supabase
            .from('manifests')
            .update({ 
                status: 'PENDING', 
                payment_method: paymentMethod 
            })
            .eq('supplier_id', user.id)
            .eq('status', 'DRAFT');

        if (updateError) throw updateError;

        alert(`MANIFEST SEALED VIA ${paymentMethod.replace(/_/g, ' ')}. AWAITING VERIFICATION.`);
        manifest = []; 
        renderManifest(); 
        closeAllOverlays();
    } catch (err) {
        alert("Transaction failed: " + err.message);
    } finally {
        sealManifestBtn.innerText = "SEAL MANIFEST";
        sealManifestBtn.disabled = false;
    }
}

// --- 4. AUTHENTICATION (REWRITTEN FOR SIGNUP WITH SUPPLIERS TABLE) ---

// Toggle between Login and Signup modes
authToggle.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        authTitle.innerText = "SUPPLIER LOGIN";
        authSubmitBtn.innerText = "AUTHENTICATE";
        authToggle.innerText = "DON'T HAVE AN ACCOUNT? SIGN UP";
        if (signupFields) signupFields.style.display = 'none';
    } else {
        authTitle.innerText = "SUPPLIER REGISTRATION";
        authSubmitBtn.innerText = "CREATE ACCOUNT";
        authToggle.innerText = "ALREADY HAVE AN ACCOUNT? LOGIN";
        if (signupFields) signupFields.style.display = 'block';
    }

    // Toggle required state on business fields so they don't block login
    const bName = document.getElementById('businessName');
    const cNum = document.getElementById('contactNumber');
    if(bName) bName.required = !isLoginMode;
    if(cNum) cNum.required = !isLoginMode;

    statusText.textContent = ""; // Clear status on toggle
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Fallback selectors to handle both older and newer HTML versions of the input
    const email = document.getElementById('authEmail')?.value || loginForm.querySelector('input[type="email"], input[type="text"]').value;
    const password = document.getElementById('authPassword')?.value || loginForm.querySelector('input[type="password"]').value;

    statusText.textContent = isLoginMode ? '[SYSTEM] AUTHENTICATING...' : '[SYSTEM] CREATING PROTOCOL...';

    if (isLoginMode) {
        // Handle Login
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            statusText.textContent = `[ERROR] ${error.message.toUpperCase()}`;
        } else {
            statusText.textContent = '[SYSTEM] ACCESS GRANTED';
            setTimeout(() => {
                closeAllOverlays();
                loadManifestFromDB();
            }, 1000);
        }

    } else {
        // Handle Signup
        const { data: authData, error: authError } = await _supabase.auth.signUp({ email, password });

        if (authError) {
            statusText.textContent = `[ERROR] ${authError.message.toUpperCase()}`;
            return;
        }

        // 2. Insert into Suppliers Table
        const businessName = document.getElementById('businessName') ? document.getElementById('businessName').value : 'N/A';
        const contactNumber = document.getElementById('contactNumber') ? document.getElementById('contactNumber').value : 'N/A';

        // Check if user object returned successfully before DB insert
        if (authData.user) {
            const { error: dbError } = await _supabase
                .from('suppliers')
                .insert([{ 
                    id: authData.user.id, // Primary key maps directly to auth.users.id
                    supplier_id: email.split('@')[0], 
                    business_name: businessName,
                    contact_number: contactNumber,
                    status: 'pending' // Account sits in pending until admin approval
                }]);

            if (dbError) {
                statusText.textContent = `[DB ERROR] ${dbError.message.toUpperCase()}`;
                return;
            }
        }

        if (authData.user && authData.session === null) {
            statusText.textContent = '[SUCCESS] REGISTRATION COMPLETE. CHECK EMAIL.';
        } else {
            statusText.textContent = '[SYSTEM] ACCOUNT CREATED & DATABASE SYNCED';
            setTimeout(() => {
                closeAllOverlays();
                loadManifestFromDB();
            }, 1000);
        }
    }
});

async function loadManifestFromDB() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;
    const { data } = await _supabase
        .from('manifests')
        .select(`id, manifest_items (product_variant_id, quantity_kg, price_at_time, product_variants (type_name, products (brand_name)))`)
        .eq('supplier_id', user.id).eq('status', 'DRAFT').maybeSingle();

    if (data && data.manifest_items) {
        manifest = data.manifest_items.map(item => ({
            variantId: item.product_variant_id,
            type: `${item.product_variants.products.brand_name} (${item.product_variants.type_name})`,
            weight: item.quantity_kg,
            price: item.price_at_time
        }));
        renderManifest();
    }
}

// --- 5. UI CONTROLS ---

const closeAllOverlays = () => {
    sharedOverlay.classList.remove('active');
    loginModal.classList.remove('active');
    manifestSidebar.classList.remove('active');
    if (paymentModal) paymentModal.style.display = 'none';
    if (detailsModal) detailsModal.style.display = 'none'; // Added to close details modal
    document.body.style.overflow = 'auto'; 
};

sharedOverlay.addEventListener('click', closeAllOverlays);
document.getElementById('cancelPayment')?.addEventListener('click', closeAllOverlays);
loginBtn.addEventListener('click', () => { sharedOverlay.classList.add('active'); loginModal.classList.add('active'); });
closeLoginBtn.addEventListener('click', closeAllOverlays);
openManifestBtn.addEventListener('click', () => { sharedOverlay.classList.add('active'); manifestSidebar.classList.add('active'); });
closeManifestBtn.addEventListener('click', closeAllOverlays);

// --- INITIALIZE ---
fetchInventory();
loadManifestFromDB();