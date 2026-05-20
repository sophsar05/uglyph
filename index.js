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
const openManifestBtn = document.getElementById('openManifestBtn');
const closeManifestBtn = document.getElementById('closeManifestBtn');
const manifestSidebar = document.getElementById('manifestSidebar');
const sealManifestBtn = document.getElementById('sealManifestBtn');

// Checkout Modal Elements
const checkoutModal = document.getElementById('checkoutModal');
const checkoutForm = document.getElementById('checkoutForm');
const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
const checkoutName = document.getElementById('checkoutName');
const checkoutContact = document.getElementById('checkoutContact');
const checkoutAddress = document.getElementById('checkoutAddress');
const checkoutPayment = document.getElementById('checkoutPayment');
const checkoutStatus = document.getElementById('checkoutStatus');

// --- DYNAMIC TOAST & PRODUCT DETAILS UI ---
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
            <div><span style="opacity:0.5; font-size:12px;">MARKET</span><br><span style="color:red; font-weight:bold;">₱${product.market_price}</span></div>
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
            <div class="product-card" onclick="toggleMobileDetails(this)" style="cursor:pointer; border: 2px solid #000; margin-bottom: 20px; background: #fff; box-shadow: 4px 4px 0px #000;">
                <div class="card-img-wrap" style="position: relative; border-bottom: 2px solid #000;">
                    <span class="badge-right" style="position: absolute; top: 10px; right: 10px; background: #d32f2f; color: white; padding: 5px 10px; font-weight: bold; border: 2px solid #000; box-shadow: 2px 2px 0px #000; z-index: 2;">-${discount}%</span>
                    <div class="product-placeholder brand-font" style="display:flex; align-items:center; justify-content:center; height:180px; background:#111; color:var(--yellow, #f1c40f); font-size:40px;">
                        ${product.brand_name.split(' ')[0]}
                    </div>
                    <span class="price-tag" style="position: absolute; bottom: 10px; right: 10px; background: var(--yellow, #f1c40f); color: #000; padding: 5px 10px; font-weight: bold; border: 2px solid #000; box-shadow: 2px 2px 0px #000;"><span style="font-family: sans-serif;">₱</span>${product.rescue_price} / KG</span>
                </div>
                
                <div class="card-body" style="padding: 15px;">
                    <h3 class="product-name brand-font" style="margin: 0; font-size: 1.5rem; text-transform: uppercase;">${product.brand_name}</h3>
                    
                    <div class="expandable-details" style="display: none; margin-top: 15px;">
                        <div class="pricing-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                            <div class="price-box" style="border: 2px solid #ddd; padding: 10px; display: flex; flex-direction: column; justify-content: center; background: #f9f9f9;">
                                <span class="p-label" style="font-size: 0.7rem; font-weight: 800; color: #555; margin-bottom: 5px;">REGULAR PRICE</span>
                                <span class="p-value" style="font-size: 1.6rem; font-weight: 900; color: #ccc; line-height: 1;"><span style="font-family: sans-serif;">₱</span>${product.market_price}</span>
                            </div>
                            <div class="price-box highlight" style="border: 2px solid #000; padding: 10px; display: flex; flex-direction: column; justify-content: center; background: var(--yellow, #f1c40f); box-shadow: 3px 3px 0px #e0e0e0;">
                                <span class="p-label" style="font-size: 0.7rem; font-weight: 800; color: #000; margin-bottom: 5px;">SURPLUS PRICE</span>
                                <span class="p-value" style="font-size: 2rem; font-weight: 900; color: #000; line-height: 1;"><span>₱</span>${product.rescue_price}</span>
                            </div>
                        </div>

                        <div class="select-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-top: 15px;">
                            <select class="variant-select mono-font" onclick="event.stopPropagation()" style="width: 100%; padding: 12px; border: 2px solid #000; background: #e0e0e0; font-weight: bold; text-transform: uppercase; cursor: pointer; box-shadow: 2px 2px 0px #000; outline: none;">
                                ${product.variants.map(v => `<option value="${v.id}">${v.type_name}</option>`).join('')}
                            </select>
                            <select class="weight-select mono-font" onclick="event.stopPropagation()" style="width: 100%; padding: 12px; border: 2px solid #000; background: #e0e0e0; font-weight: bold; text-transform: uppercase; cursor: pointer; box-shadow: 2px 2px 0px #000; outline: none;">
                                <option value="1">1 KG</option>
                                <option value="5">5 KG</option>
                                <option value="10">10 KG</option>
                                <option value="25">25 KG</option>
                            </select>
                        </div>

                        <button class="btn-dark btn-full" style="margin-top: 20px; width: 100%; padding: 15px; background: #111; color: var(--yellow, #f1c40f); border: none; font-weight: 900; font-size: 1.1rem; cursor: pointer;" onclick="event.stopPropagation(); addToManifest('${product.id}', this)">
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
    saveManifestToLocalStorage();
    showToast(`+${weight}KG ${product.brand_name.split(' ')[0]} ADDED`);

    // Auto-open manifest sidebar after adding an item
    sharedOverlay.classList.add('active');
    manifestSidebar.classList.add('active');
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
    saveManifestToLocalStorage();
};

window.removeItem = function(index) {
    manifest.splice(index, 1);
    renderManifest();
    saveManifestToLocalStorage();
};

// --- Local Storage Management for Local Guest Cart Drafts ---
function saveManifestToLocalStorage() {
    localStorage.setItem('uglyph_guest_manifest', JSON.stringify(manifest));
}

function loadManifestFromLocalStorage() {
    const saved = localStorage.getItem('uglyph_guest_manifest');
    if (saved) {
        try {
            manifest = JSON.parse(saved);
            renderManifest();
        } catch (e) {
            console.error("Error reading manifest cache:", e);
        }
    }
}

// --- 3. CHECKOUT & SUBMISSION HANDLING ---

// Open Checkout Modal
sealManifestBtn.addEventListener('click', () => {
    if (manifest.length === 0) return alert("Manifest is empty.");
    manifestSidebar.classList.remove('active');
    checkoutModal.classList.add('active');
    sharedOverlay.classList.add('active');
});

// Handle Checkout Submission
checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = checkoutName.value;
    const contact = checkoutContact.value;
    const address = checkoutAddress.value;
    const paymentMethod = checkoutPayment.value;

    checkoutStatus.textContent = '[SYSTEM] INITIALIZING SUBMISSION PROTOCOL...';
    
    const confirmBtn = document.getElementById('confirmCheckoutBtn');
    confirmBtn.innerText = "PROCESSING MANIFEST...";
    confirmBtn.disabled = true;

    try {
        const totalAmount = manifest.reduce((sum, item) => sum + (item.weight * item.price), 0);

        const { data: manifestRecord, error: mError } = await _supabase
            .from('manifests')
            .insert([{
                customer_name: name,
                delivery_address: `${address} (Contact: ${contact})`,
                payment_method: paymentMethod,
                total_amount: totalAmount,
                status: 'PENDING'
            }])
            .select()
            .single();

        if (mError) throw mError;

        const lineItems = manifest.map(item => ({
            manifest_id: manifestRecord.id,
            product_variant_id: item.variantId,
            quantity_kg: item.weight,
            price_at_time: item.price,
            line_total: item.weight * item.price
        }));

        const { error: itemsError } = await _supabase
            .from('manifest_items')
            .insert(lineItems);

        if (itemsError) throw itemsError;

        manifest = [];
        renderManifest();
        saveManifestToLocalStorage();
        closeAllOverlays();
        checkoutForm.reset();

        if (paymentMethod !== 'CASH_ON_DELIVERY' && manifestRecord) {
            showReceiptUploadPrompt(manifestRecord.id, paymentMethod);
        } else {
            showToast('MANIFEST SEALED. AWAITING DISPATCH VERIFICATION.');
        }

    } catch (err) {
        console.error(err);
        checkoutStatus.textContent = `[ERROR] ${err.message.toUpperCase()}`;
        confirmBtn.disabled = false;
        confirmBtn.innerText = "CONFIRM & SEAL MANIFEST";
    }
});

// --- Image Compression Utility ---
// Compresses an image file before upload, keeping max width/height within limits
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Scale down maintaining aspect ratio
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export to compressed JPEG blob
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = err => reject(err);
        };
        reader.onerror = err => reject(err);
    });
}


// --- Receipt Upload Workflow ---

function showReceiptUploadPrompt(manifestId, paymentMethod) {
    const existing = document.getElementById('receiptUploadModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'receiptUploadModal';
    modal.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:1002; background:#111; border:3px solid var(--yellow,#FFD600); padding:30px; width:90%; max-width:420px; color:#fff;";
    modal.innerHTML = `
        <h2 class="brand-font" style="color:var(--yellow,#FFD600); font-size:24px; margin-bottom:8px;">UPLOAD RECEIPT</h2>
        <p class="mono-font" style="font-size:13px; color:#aaa; margin-bottom:20px;">
            Upload your ${paymentMethod.replace(/_/g,' ')} payment screenshot so admin can verify your order.
        </p>
        <input type="file" id="receiptFileInput" accept="image/*" style="width:100%; padding:12px; background:#222; border:2px solid #444; color:#fff; margin-bottom:15px; font-family:'JetBrains Mono',monospace;">
        <div style="display:flex; gap:10px;">
            <button id="submitReceiptBtn" class="btn-dark" style="flex:1; padding:14px; font-size:15px; background:var(--yellow,#FFD600); color:#111; border:none; font-family:'Anton',sans-serif; text-transform:uppercase; cursor:pointer;">
                SUBMIT RECEIPT
            </button>
            <button id="skipReceiptBtn" class="mono-font" style="padding:14px; border:1px solid #444; background:none; color:#888; cursor:pointer; font-size:12px;">
                SKIP
            </button>
        </div>
        <div id="receiptUploadStatus" class="mono-font" style="margin-top:15px; font-size:12px; color:#aaa; text-align:center;"></div>
    `;
    document.body.appendChild(modal);
    sharedOverlay.classList.add('active');

    document.getElementById('skipReceiptBtn').onclick = () => {
        modal.remove();
        closeAllOverlays();
        showToast('MANIFEST SEALED. UPLOAD RECEIPT LATER TO FINALIZE VERIFICATION.');
    };

    document.getElementById('submitReceiptBtn').onclick = async () => {
        const file = document.getElementById('receiptFileInput').files[0];
        if (!file) { document.getElementById('receiptUploadStatus').textContent = 'Please select a file.'; return; }

        const statusEl = document.getElementById('receiptUploadStatus');
        const submitBtn = document.getElementById('submitReceiptBtn');
        submitBtn.textContent = 'COMPRESSING...';
        submitBtn.disabled = true;
        statusEl.textContent = 'Optimizing image...';

        try {
            // Compress the image before uploading (Max 800x800, 70% Quality JPEG)
            const compressedBlob = await compressImage(file, 800, 800, 0.7);

            statusEl.textContent = 'Uploading to manifest...';
            submitBtn.textContent = 'UPLOADING...';

            // Ensure filename reflects the compression and format change
            const originalName = file.name.split('.').slice(0, -1).join('.');
            const filePath = `guest_manifests/${manifestId}/${Date.now()}_${originalName}_compressed.jpg`;
            
            const { error: uploadError } = await _supabase.storage
                .from('receipts')
                .upload(filePath, compressedBlob, { 
                    upsert: true,
                    contentType: 'image/jpeg' 
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = _supabase.storage.from('receipts').getPublicUrl(filePath);

            await _supabase.from('manifests')
                .update({ receipt_url: urlData.publicUrl })
                .eq('id', manifestId);

            statusEl.textContent = '✓ RECEIPT UPLOADED SUCCESSFULLY';
            statusEl.style.color = '#22c55e';
            setTimeout(() => { modal.remove(); closeAllOverlays(); showToast('RECEIPT SUBMITTED. AWAITING VERIFICATION.'); }, 1500);
        } catch (err) {
            statusEl.textContent = `Upload failed: ${err.message}`;
            statusEl.style.color = '#D32F2F';
            submitBtn.textContent = 'RETRY';
            submitBtn.disabled = false;
        }
    };
}

// --- 4. UI CONTROLS ---

const closeAllOverlays = () => {
    sharedOverlay.classList.remove('active');
    manifestSidebar.classList.remove('active');
    if (checkoutModal) checkoutModal.classList.remove('active');
    if (detailsModal) detailsModal.style.display = 'none';
    
    const receiptModal = document.getElementById('receiptUploadModal');
    if (receiptModal) receiptModal.remove();
    
    // Clear checkout error descriptions upon dialog closure
    if (checkoutStatus) checkoutStatus.textContent = "";
    const confirmBtn = document.getElementById('confirmCheckoutBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerText = "CONFIRM & SEAL MANIFEST";
    }

    document.body.style.overflow = 'auto'; 
};

sharedOverlay.addEventListener('click', closeAllOverlays);
closeCheckoutBtn.addEventListener('click', closeAllOverlays);
openManifestBtn.addEventListener('click', () => { sharedOverlay.classList.add('active'); manifestSidebar.classList.add('active'); });
closeManifestBtn.addEventListener('click', closeAllOverlays);

// --- INITIALIZE BASE DATA ---
fetchInventory();
loadManifestFromLocalStorage();