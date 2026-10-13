// ==========================================================================
// VERDANT ORGANIC GROCERY - APPLICATION CONTROLLER & STATE
// ==========================================================================

class GroceryApp {
  constructor() {
    this.products = PRODUCTS_DATA;
    this.recipeBundles = RECIPE_BUNDLES;
    
    // Persistent State
    this.cart = JSON.parse(localStorage.getItem('verdant_cart')) || [];
    this.wishlist = JSON.parse(localStorage.getItem('verdant_wishlist')) || [];
    this.currency = localStorage.getItem('verdant_currency') || 'INR';
    this.activeCoupon = null;

    // Filter & Sort State
    this.activeCategory = 'all';
    this.filterOrganicOnly = false;
    this.searchQuery = '';
    this.sortBy = 'recommended';

    // Constants
    this.FREE_DELIVERY_THRESHOLD = { INR: 499, USD: 20 };
    this.DELIVERY_FEE = { INR: 40, USD: 1.50 };
    this.PACKAGING_FEE = { INR: 15, USD: 0.20 };
    this.USD_CONVERSION_RATE = 0.0125; // ₹80 = $1

    // Razorpay Gateway Config
    this.razorpayConfig = {
      isConfigured: false,
      keyId: '',
      mode: 'test'
    };

    this.init();
  }

  init() {
    this.fetchRazorpayConfig();
    this.setupEventListeners();
    this.renderCategoryTabs();
    this.renderProducts();
    this.renderRecipeBundles();
    this.updateCartUI();
    this.updateWishlistUI();
    this.startDealCountdown();
  }

  // ================= CURRENCY =================

  setCurrency(curr) {
    this.currency = curr;
    localStorage.setItem('verdant_currency', curr);
    
    document.querySelectorAll('.currency-opt').forEach(el => {
      el.classList.toggle('active', el.dataset.curr === curr);
    });

    this.renderProducts();
    this.renderRecipeBundles();
    this.updateCartUI();

    const modal = document.getElementById('razorpay-modal');
    if (modal && modal.classList.contains('active')) {
      this.openRazorpayModal();
    }

    this.showToast(`Currency changed to ${curr === 'INR' ? '₹ INR' : '$ USD'}`, 'fas fa-coins');
  }

  formatPrice(priceINR, priceUSD) {
    if (this.currency === 'USD') {
      const val = priceUSD || (priceINR * this.USD_CONVERSION_RATE);
      return `$${val.toFixed(2)}`;
    }
    return `₹${priceINR}`;
  }

  getNumericPrice(product) {
    if (this.currency === 'USD') {
      return product.priceUSD || (product.priceINR * this.USD_CONVERSION_RATE);
    }
    return product.priceINR;
  }

  // ================= DEAL COUNTDOWN TIMER =================
  startDealCountdown() {
    const timerEl = document.getElementById('deal-timer');
    if (!timerEl) return;

    let totalSeconds = 4 * 3600 + 32 * 60 + 18; // 4 hours 32 mins
    setInterval(() => {
      if (totalSeconds <= 0) totalSeconds = 24 * 3600;
      totalSeconds--;

      const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const secs = String(totalSeconds % 60).padStart(2, '0');
      timerEl.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  // ================= CATEGORIES & FILTERS =================
  renderCategoryTabs() {
    const container = document.getElementById('category-tabs-container');
    if (!container) return;

    const counts = {
      all: this.products.length,
      fruits: this.products.filter(p => p.category === 'fruits').length,
      vegetables: this.products.filter(p => p.category === 'vegetables').length,
      organic: this.products.filter(p => p.organic).length
    };

    const categories = [
      { id: 'all', label: 'All Items', icon: 'fas fa-border-all', count: counts.all },
      { id: 'fruits', label: 'Fresh Fruits', icon: 'fas fa-apple-alt', count: counts.fruits },
      { id: 'vegetables', label: 'Farm Vegetables', icon: 'fas fa-carrot', count: counts.vegetables },
      { id: 'organic', label: 'Organic', icon: 'fas fa-seedling', count: counts.organic }
    ];

    container.innerHTML = categories.map(cat => `
      <button class="category-tab-btn ${this.activeCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
        <span class="tab-icon"><i class="${cat.icon}"></i></span>
        <span>${cat.label}</span>
        <span class="tab-count">${cat.count}</span>
      </button>
    `).join('');

    container.querySelectorAll('.category-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.dataset.cat;
        container.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderProducts();
      });
    });
  }

  getFilteredProducts() {
    let list = [...this.products];

    // Category filter
    if (this.activeCategory === 'fruits') {
      list = list.filter(p => p.category === 'fruits');
    } else if (this.activeCategory === 'vegetables') {
      list = list.filter(p => p.category === 'vegetables');
    } else if (this.activeCategory === 'organic') {
      list = list.filter(p => p.organic);
    } else if (this.activeCategory === 'bestseller') {
      list = list.filter(p => p.badgeType === 'hot');
    } else if (this.activeCategory === 'sale') {
      list = list.filter(p => p.badgeType === 'sale');
    }

    // Secondary checkbox: Organic only
    if (this.filterOrganicOnly) {
      list = list.filter(p => p.organic);
    }

    // Search query filter
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.localName.toLowerCase().includes(q) ||
        p.subCategory.toLowerCase().includes(q) ||
        p.origin.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort order
    switch (this.sortBy) {
      case 'price-asc':
        list.sort((a, b) => this.getNumericPrice(a) - this.getNumericPrice(b));
        break;
      case 'price-desc':
        list.sort((a, b) => this.getNumericPrice(b) - this.getNumericPrice(a));
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'name-asc':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // 'recommended': keep id order or bestsellers first
        list.sort((a, b) => b.reviewsCount - a.reviewsCount);
        break;
    }

    return list;
  }

  // ================= RENDER PRODUCTS GRID =================
  renderProducts() {
    const grid = document.getElementById('products-grid');
    const countDisplay = document.getElementById('product-count-display');
    if (!grid) return;

    const items = this.getFilteredProducts();

    if (countDisplay) {
      countDisplay.innerHTML = `Showing <b>${items.length}</b> of 30 farm items`;
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="no-results-box">
          <div class="no-results-icon"><i class="fas fa-search"></i></div>
          <h3>No items found</h3>
          <p style="color: var(--text-muted); margin-top: 8px;">Try clearing filters or search terms.</p>
          <button class="btn-primary" style="margin-top: 16px;" onclick="app.resetFilters()">Reset All Filters</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map(product => {
      const inWishlist = this.wishlist.includes(product.id);
      const cartItem = this.cart.find(c => c.productId === product.id);
      const inCartQty = cartItem ? cartItem.quantity : 0;
      const formattedPrice = this.formatPrice(product.priceINR, product.priceUSD);
      const formattedOrig = this.formatPrice(product.originalPriceINR, product.originalPriceUSD);

      // SVG fallback image if network fails
      const fallbackSvg = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
          <rect width="400" height="400" fill="#f5f3ef"/>
          <circle cx="200" cy="180" r="60" fill="#e7e4dc"/>
          <path d="M200 145 C180 170 180 195 200 215 C220 195 220 170 200 145 Z" fill="#2d372e"/>
          <text x="200" y="275" font-family="'Plus Jakarta Sans', sans-serif" font-size="20" font-weight="600" text-anchor="middle" fill="#1c1917">${product.name}</text>
        </svg>
      `);

      return `
        <div class="product-card" data-id="${product.id}">
          <div class="card-top-bar">
            <span class="card-badge ${product.badgeType}">${product.badge}</span>
            <button class="btn-wishlist ${inWishlist ? 'active' : ''}" 
                    aria-label="Save to Wishlist"
                    onclick="app.toggleWishlist(${product.id})">
              <i class="${inWishlist ? 'fas' : 'far'} fa-heart"></i>
            </button>
          </div>

          <div class="product-image-container" onclick="app.openQuickView(${product.id})">
            <img class="product-img" 
                 src="${product.image}" 
                 alt="${product.name}" 
                 loading="lazy"
                 onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,${fallbackSvg}';">
            <button class="quick-view-overlay-btn">
              Quick View
            </button>
          </div>

          <div class="card-content">
            <div class="category-meta-row">
              <span class="product-cat-tag">${product.subCategory}</span>
              <span class="product-unit-text">${product.unit}</span>
            </div>

            <h3 class="product-title" onclick="app.openQuickView(${product.id})">${product.name}</h3>

            <div class="card-rating-row">
              <span class="rating-stars"><i class="fas fa-star"></i></span>
              <span class="rating-score">${product.rating}</span>
            </div>

            <div class="card-footer-box">
              <div class="price-unit-col">
                <div class="price-row">
                  <span class="current-price">${formattedPrice}</span>
                  <span class="original-price">${formattedOrig}</span>
                </div>
              </div>

              <div class="card-action-wrap" id="action-wrap-${product.id}">
                ${inCartQty > 0 ? `
                  <div class="card-stepper">
                    <button class="stepper-btn" onclick="app.updateCartQty(${product.id}, -1)">−</button>
                    <span class="stepper-count">${inCartQty}</span>
                    <button class="stepper-btn" onclick="app.updateCartQty(${product.id}, 1)">+</button>
                  </div>
                ` : `
                  <button class="btn-add-cart" onclick="app.addToCart(${product.id})">
                    Add
                  </button>
                `}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  resetFilters() {
    this.activeCategory = 'all';
    this.filterOrganicOnly = false;
    this.searchQuery = '';
    this.sortBy = 'recommended';

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = 'recommended';
    const organicChip = document.getElementById('filter-organic-chip');
    if (organicChip) organicChip.classList.remove('active');

    this.renderCategoryTabs();
    this.renderProducts();
  }

  // ================= RECIPE BUNDLES =================
  renderRecipeBundles() {
    const container = document.getElementById('recipe-bundles-container');
    if (!container) return;

    container.innerHTML = this.recipeBundles.map(bundle => {
      const bundleProducts = bundle.items.map(id => this.products.find(p => p.id === id)).filter(Boolean);
      
      const totalPriceINR = bundleProducts.reduce((sum, p) => sum + p.priceINR, 0);
      const discountedPriceINR = Math.round(totalPriceINR * (1 - bundle.discountPercent / 100));

      const totalPriceUSD = bundleProducts.reduce((sum, p) => sum + (p.priceUSD || p.priceINR * this.USD_CONVERSION_RATE), 0);
      const discountedPriceUSD = totalPriceUSD * (1 - bundle.discountPercent / 100);

      const displayDiscounted = this.formatPrice(discountedPriceINR, discountedPriceUSD);
      const displayOriginal = this.formatPrice(totalPriceINR, totalPriceUSD);

      return `
        <div class="recipe-bundle-card">
          <div class="bundle-top-row">
            <div class="bundle-icon-title">
              <span class="bundle-emoji"><i class="${bundle.icon}"></i></span>
              <div>
                <h4 class="bundle-name">${bundle.title}</h4>
                <p class="bundle-sub">${bundle.subtitle}</p>
              </div>
            </div>
            <span class="bundle-badge">${bundle.badge}</span>
          </div>

          <div class="bundle-meta-tags">
            <span><i class="far fa-clock"></i> ${bundle.prepTime}</span>
            <span><i class="fas fa-utensils"></i> ${bundle.serves}</span>
            <span><i class="fas fa-leaf"></i> ${bundleProducts.length} Fresh Ingredients</span>
          </div>

          <div class="bundle-items-preview">
            ${bundleProducts.map(p => `
              <img class="bundle-item-thumb" 
                   src="${p.image}" 
                   title="${p.name}" 
                   alt="${p.name}" 
                   loading="lazy"
                   onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'50\\' height=\\'50\\'><rect width=\\'50\\' height=\\'50\\' fill=\\'%23f5f3ef\\'/><circle cx=\\'25\\' cy=\\'25\\' r=\\'12\\' fill=\\'%23e7e4dc\\'/><path d=\\'M25 18 C20 23 20 28 25 32 C30 28 30 23 25 18 Z\\' fill=\\'%23292524\\'/></svg>';">
            `).join('')}
          </div>

          <div class="bundle-action-row">
            <div class="bundle-price-box">
              <span class="bundle-price-val">${displayDiscounted}</span>
              <span class="bundle-discount-tag">${bundle.discountPercent}% BUNDLE SAVINGS (was ${displayOriginal})</span>
            </div>
            <button class="btn-primary" style="padding: 8px 18px; font-size: 0.85rem;" 
                    onclick="app.addBundleToCart('${bundle.id}')">
              <i class="fas fa-cart-plus"></i> Add All to Cart
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  addBundleToCart(bundleId) {
    const bundle = this.recipeBundles.find(b => b.id === bundleId);
    if (!bundle) return;

    bundle.items.forEach(id => {
      this.addToCart(id, false); // Add without individual toast
    });

    this.renderProducts();
    this.updateCartUI();
    this.openCart();
    this.showToast(`Added all ingredients for "${bundle.title}"!`, 'fas fa-sparkles');
  }

  // ================= CART OPERATIONS =================
  addToCart(productId, notify = true) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const existing = this.cart.find(c => c.productId === productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.push({ productId, quantity: 1 });
    }

    this.saveCart();
    this.renderProducts();
    this.updateCartUI();

    if (notify) {
      this.showToast(`Added ${product.name} to cart`, 'fas fa-cart-arrow-down');
    }
  }

  updateCartQty(productId, delta) {
    const idx = this.cart.findIndex(c => c.productId === productId);
    if (idx === -1) return;

    this.cart[idx].quantity += delta;
    if (this.cart[idx].quantity <= 0) {
      const removed = this.products.find(p => p.id === productId);
      this.cart.splice(idx, 1);
      if (removed) this.showToast(`Removed ${removed.name}`, 'fas fa-trash');
    }

    this.saveCart();
    this.renderProducts();
    this.updateCartUI();
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter(c => c.productId !== productId);
    this.saveCart();
    this.renderProducts();
    this.updateCartUI();
    this.showToast('Item removed from cart', 'fas fa-trash');
  }

  saveCart() {
    localStorage.setItem('verdant_cart', JSON.stringify(this.cart));
  }

  getCartCalculations() {
    let subtotalINR = 0;
    let subtotalUSD = 0;
    let totalItems = 0;

    this.cart.forEach(item => {
      const prod = this.products.find(p => p.id === item.productId);
      if (prod) {
        subtotalINR += prod.priceINR * item.quantity;
        const uPrice = prod.priceUSD || (prod.priceINR * this.USD_CONVERSION_RATE);
        subtotalUSD += uPrice * item.quantity;
        totalItems += item.quantity;
      }
    });

    const isINR = this.currency === 'INR';
    const subtotal = isINR ? subtotalINR : subtotalUSD;
    const freeThreshold = isINR ? this.FREE_DELIVERY_THRESHOLD.INR : this.FREE_DELIVERY_THRESHOLD.USD;
    const baseDelivery = isINR ? this.DELIVERY_FEE.INR : this.DELIVERY_FEE.USD;
    const packaging = isINR ? this.PACKAGING_FEE.INR : this.PACKAGING_FEE.USD;

    let discount = 0;
    if (this.activeCoupon) {
      if (this.activeCoupon.type === 'percent') {
        discount = subtotal * this.activeCoupon.value;
      } else {
        discount = isINR ? this.activeCoupon.valueINR : this.activeCoupon.valueUSD;
      }
    }

    const deliveryFee = subtotal >= freeThreshold || totalItems === 0 ? 0 : baseDelivery;
    const finalTotal = Math.max(0, subtotal - discount + (totalItems > 0 ? deliveryFee + packaging : 0));

    return {
      subtotalINR,
      subtotalUSD,
      subtotal,
      totalItems,
      discount,
      deliveryFee,
      packaging: totalItems > 0 ? packaging : 0,
      finalTotal,
      freeThreshold,
      amountNeededForFreeDelivery: Math.max(0, freeThreshold - subtotal)
    };
  }

  updateCartUI() {
    const calc = this.getCartCalculations();

    // Header Cart Badge & Total
    const badge = document.getElementById('header-cart-badge');
    const headerTotal = document.getElementById('header-cart-total');
    const drawerBadge = document.getElementById('drawer-cart-count');

    if (badge) badge.textContent = calc.totalItems;
    if (drawerBadge) drawerBadge.textContent = `${calc.totalItems} items`;
    if (headerTotal) {
      headerTotal.textContent = this.currency === 'INR' ? `₹${Math.round(calc.finalTotal)}` : `$${calc.finalTotal.toFixed(2)}`;
    }

    // Render Drawer Items List
    const drawerList = document.getElementById('drawer-cart-items');
    const drawerFooter = document.getElementById('drawer-cart-footer');
    const emptyState = document.getElementById('drawer-empty-state');
    const meterFill = document.getElementById('free-meter-fill');
    const meterText = document.getElementById('free-meter-text');

    // Free delivery progress meter
    if (meterFill && meterText) {
      if (calc.totalItems === 0) {
        meterFill.style.width = '0%';
        meterText.innerHTML = `Add <b>${this.currency === 'INR' ? '₹' + calc.freeThreshold : '$' + calc.freeThreshold}</b> for <b>FREE Delivery</b>`;
      } else if (calc.amountNeededForFreeDelivery === 0) {
        meterFill.style.width = '100%';
        meterText.innerHTML = `<b>You unlocked FREE Express Delivery!</b>`;
      } else {
        const pct = Math.min(100, Math.round((calc.subtotal / calc.freeThreshold) * 100));
        meterFill.style.width = `${pct}%`;
        const diffText = this.currency === 'INR' ? `₹${Math.round(calc.amountNeededForFreeDelivery)}` : `$${calc.amountNeededForFreeDelivery.toFixed(2)}`;
        meterText.innerHTML = `Add <b>${diffText}</b> more for <b>FREE Express Delivery</b>`;
      }
    }

    if (calc.totalItems === 0) {
      if (drawerList) drawerList.style.display = 'none';
      if (drawerFooter) drawerFooter.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (drawerList) drawerList.style.display = 'flex';
    if (drawerFooter) drawerFooter.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    if (drawerList) {
      drawerList.innerHTML = this.cart.map(item => {
        const prod = this.products.find(p => p.id === item.productId);
        if (!prod) return '';

        const itemTotal = this.formatPrice(
          prod.priceINR * item.quantity, 
          (prod.priceUSD || prod.priceINR * this.USD_CONVERSION_RATE) * item.quantity
        );

        return `
          <div class="cart-item-card">
            <img class="cart-item-img" src="${prod.image}" alt="${prod.name}">
            <div class="cart-item-details">
              <div class="cart-item-name">${prod.name}</div>
              <div class="cart-item-unit">${prod.unit}</div>
              <div class="cart-item-bottom">
                <span class="cart-item-price">${itemTotal}</span>
                <div class="cart-mini-stepper">
                  <button class="cart-mini-btn" onclick="app.updateCartQty(${prod.id}, -1)">−</button>
                  <span class="cart-mini-val">${item.quantity}</span>
                  <button class="cart-mini-btn" onclick="app.updateCartQty(${prod.id}, 1)">+</button>
                </div>
              </div>
            </div>
            <button class="cart-item-delete" onclick="app.removeFromCart(${prod.id})" title="Remove item">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        `;
      }).join('');
    }

    // Price Breakdown
    const subtotalEl = document.getElementById('cart-subtotal-val');
    const discountEl = document.getElementById('cart-discount-val');
    const discountRow = document.getElementById('cart-discount-row');
    const deliveryEl = document.getElementById('cart-delivery-val');
    const packagingEl = document.getElementById('cart-packaging-val');
    const grandTotalEl = document.getElementById('cart-grand-total-val');
    const checkoutTotalBadge = document.getElementById('checkout-button-total');

    const fmt = (inrVal, usdVal) => this.currency === 'INR' ? `₹${Math.round(inrVal)}` : `$${usdVal.toFixed(2)}`;

    if (subtotalEl) subtotalEl.textContent = fmt(calc.subtotalINR, calc.subtotalUSD);
    if (discountRow && discountEl) {
      if (calc.discount > 0) {
        discountRow.style.display = 'flex';
        discountEl.textContent = `-${fmt(calc.discount, calc.discount)}`;
      } else {
        discountRow.style.display = 'none';
      }
    }
    if (deliveryEl) {
      deliveryEl.innerHTML = calc.deliveryFee === 0 ? `<b style="color: var(--primary);">FREE</b>` : fmt(calc.deliveryFee, calc.deliveryFee);
    }
    if (packagingEl) packagingEl.textContent = fmt(calc.packaging, calc.packaging);
    if (grandTotalEl) grandTotalEl.textContent = fmt(calc.finalTotal, calc.finalTotal);
    if (checkoutTotalBadge) checkoutTotalBadge.textContent = fmt(calc.finalTotal, calc.finalTotal);
  }

  applyPromo(code) {
    const cleaned = (code || '').toUpperCase().trim();
    if (!cleaned) {
      this.showToast('Please enter a coupon code', 'fas fa-tag');
      return;
    }

    if (cleaned === 'FRESH20') {
      this.activeCoupon = { code: 'FRESH20', value: 0.20, type: 'percent', label: '20% OFF Everything' };
      this.showToast('Coupon FRESH20 applied! 20% savings', 'fas fa-percent');
    } else if (cleaned === 'ORGANIC50') {
      this.activeCoupon = { code: 'ORGANIC50', valueINR: 50, valueUSD: 0.65, type: 'flat', label: '₹50 Flat OFF' };
      this.showToast('Coupon ORGANIC50 applied!', 'fas fa-check');
    } else {
      this.showToast('Invalid promo code. Try FRESH20 or ORGANIC50', 'fas fa-times-circle');
      return;
    }

    this.updateCartUI();
  }

  // ================= WISHLIST =================
  toggleWishlist(productId) {
    const idx = this.wishlist.indexOf(productId);
    const prod = this.products.find(p => p.id === productId);

    if (idx > -1) {
      this.wishlist.splice(idx, 1);
      this.showToast(`Removed from Wishlist`, 'far fa-heart');
    } else {
      this.wishlist.push(productId);
      if (prod) this.showToast(`Added ${prod.name} to Wishlist`, 'fas fa-heart');
    }

    localStorage.setItem('verdant_wishlist', JSON.stringify(this.wishlist));
    this.renderProducts();
    this.updateWishlistUI();
  }

  updateWishlistUI() {
    const countEl = document.getElementById('header-wishlist-badge');
    if (countEl) countEl.textContent = this.wishlist.length;
  }

  // ================= QUICK VIEW & NUTRITION MODAL =================
  openQuickView(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const modal = document.getElementById('quickview-modal');
    if (!modal) return;

    const formattedPrice = this.formatPrice(product.priceINR, product.priceUSD);
    const formattedOrig = this.formatPrice(product.originalPriceINR, product.originalPriceUSD);

    document.getElementById('modal-img').src = product.image;
    document.getElementById('modal-cat').textContent = `${product.category.toUpperCase()} • ${product.subCategory}`;
    document.getElementById('modal-title').textContent = product.name;
    document.getElementById('modal-local').textContent = product.localName;
    document.getElementById('modal-origin').innerHTML = `<i class="fas fa-map-marker-alt"></i> Origin: <b>${product.origin}</b> (Harvested: ${product.harvestDate})`;
    document.getElementById('modal-desc').textContent = product.description;
    document.getElementById('modal-shelf').innerHTML = `<i class="far fa-clock"></i> Storage & Shelf Life: ${product.shelfLife}`;
    document.getElementById('modal-price').textContent = formattedPrice;
    document.getElementById('modal-orig').textContent = formattedOrig;
    document.getElementById('modal-unit').textContent = product.unit;

    // Nutrition Grid entries
    const n = product.nutrition;
    const nutGrid = document.getElementById('modal-nutrition-grid');
    nutGrid.innerHTML = `
      <div class="nutrition-stat-box">
        <span class="nutrition-stat-name">Calories</span>
        <span class="nutrition-stat-val">${n.calories}</span>
      </div>
      <div class="nutrition-stat-box">
        <span class="nutrition-stat-name">Carbohydrates</span>
        <span class="nutrition-stat-val">${n.carbs}</span>
      </div>
      <div class="nutrition-stat-box">
        <span class="nutrition-stat-name">Dietary Fiber</span>
        <span class="nutrition-stat-val">${n.fiber}</span>
      </div>
      <div class="nutrition-stat-box">
        <span class="nutrition-stat-name">Protein</span>
        <span class="nutrition-stat-val">${n.protein}</span>
      </div>
      <div class="nutrition-stat-box">
        <span class="nutrition-stat-name">Healthy Fat</span>
        <span class="nutrition-stat-val">${n.fat}</span>
      </div>
      <div class="nutrition-stat-box">
        <span class="nutrition-stat-name">Vitamins & Key Nutrients</span>
        <span class="nutrition-stat-val">${n.vitaminC || n.iron || n.betaCarotene || n.vitaminA || 'Rich in Micronutrients'}</span>
      </div>
    `;

    // Action button
    const btnContainer = document.getElementById('modal-action-btn-wrap');
    btnContainer.innerHTML = `
      <button class="btn-primary" style="padding: 12px 28px;" onclick="app.addToCart(${product.id}); app.closeQuickView();">
        <i class="fas fa-cart-plus"></i> Add to Cart (${formattedPrice})
      </button>
    `;

    modal.classList.add('active');
  }

  closeQuickView() {
    const modal = document.getElementById('quickview-modal');
    if (modal) modal.classList.remove('active');
  }

  // ================= CART DRAWER TOGGLE =================
  openCart() {
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.add('active');
      backdrop.classList.add('active');
    }
  }

  closeCart() {
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('active');
      backdrop.classList.remove('active');
    }
  }

  // ================= RAZORPAY API INTEGRATION & CHECKOUT =================
  async fetchRazorpayConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success) {
        this.razorpayConfig = data;
        this.updateRazorpayConfigUI();
      }
    } catch (err) {
      console.warn('Could not contact Razorpay config API:', err);
    }
  }

  updateRazorpayConfigUI() {
    const dot = document.getElementById('header-rzp-dot');
    const label = document.getElementById('header-rzp-label');
    const banner = document.getElementById('rzp-live-api-status-banner');
    const bannerTitle = document.getElementById('rzp-banner-status-title');
    const bannerDesc = document.getElementById('rzp-banner-status-desc');
    const keyInput = document.getElementById('rzp-input-key-id');
    const modeBadge = document.getElementById('rzp-settings-mode-badge');

    if (dot) {
      dot.className = this.razorpayConfig.isConfigured ? 'rzp-dot active' : 'rzp-dot';
    }
    if (label) {
      label.textContent = this.razorpayConfig.isConfigured 
        ? `Razorpay (${this.razorpayConfig.mode.toUpperCase()})` 
        : 'Razorpay Setup';
    }
    if (keyInput && this.razorpayConfig.keyId) {
      keyInput.value = this.razorpayConfig.keyId;
    }
    if (modeBadge) {
      modeBadge.textContent = `${this.razorpayConfig.mode.toUpperCase()} MODE`;
    }

    if (banner && bannerTitle && bannerDesc) {
      if (this.razorpayConfig.isConfigured) {
        banner.className = 'rzp-notice-banner success';
        bannerTitle.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i> Razorpay API Active (${this.razorpayConfig.mode.toUpperCase()} MODE)`;
        const masked = this.razorpayConfig.keyId.length > 8 
          ? this.razorpayConfig.keyId.substring(0, 8) + '••••••••' 
          : this.razorpayConfig.keyId;
        bannerDesc.textContent = `Connected with Key: ${masked}. Orders verified via server HMAC SHA-256.`;
      } else {
        banner.className = 'rzp-notice-banner warning';
        bannerTitle.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #d97706; margin-right: 4px;"></i> Razorpay Keys Required in .env`;
        bannerDesc.innerHTML = `Enter your Test API keys in the <b>API Settings</b> tab or server <code>.env</code> to process live test payments.`;
      }
    }
  }

  async saveRazorpayKeys() {
    const keyId = document.getElementById('rzp-input-key-id')?.value.trim();
    const keySecret = document.getElementById('rzp-input-key-secret')?.value.trim();

    if (!keyId || !keySecret) {
      this.showToast('Please enter both Key ID and Key Secret', 'fas fa-exclamation-circle');
      return;
    }

    try {
      const res = await fetch('/api/save-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId, keySecret })
      });
      const data = await res.json();

      if (data.success) {
        this.showToast('Razorpay credentials saved and activated!', 'fas fa-check-circle');
        await this.fetchRazorpayConfig();
        this.switchRazorpayTab('live');
      } else {
        this.showToast(`Error: ${data.message}`, 'fas fa-times-circle');
      }
    } catch (e) {
      this.showToast('Failed to save keys to server', 'fas fa-times-circle');
    }
  }

  openRazorpayModal() {
    const calc = this.getCartCalculations();
    if (calc.totalItems === 0) {
      this.showToast('Your cart is empty', 'fas fa-shopping-cart');
      return;
    }

    this.closeCart();

    const modal = document.getElementById('razorpay-modal');
    if (!modal) return;

    // Format amounts using active currency (INR or USD)
    const displayTotal = this.currency === 'INR' 
      ? `₹${Math.round(calc.finalTotal)}` 
      : `$${calc.finalTotal.toFixed(2)}`;
    const rcptId = `rcpt_${Math.floor(100000 + Math.random() * 900000)}`;

    const orderIdLabel = document.getElementById('rzp-order-id-label');
    const headerAmt = document.getElementById('rzp-header-amount');
    const liveAmts = document.querySelectorAll('.rzp-pay-live-amount');

    if (orderIdLabel) orderIdLabel.textContent = rcptId;
    if (headerAmt) headerAmt.textContent = displayTotal;
    liveAmts.forEach(el => el.textContent = displayTotal);

    // Populate Order Items Summary in Checkout Modal with active currency
    const summaryContainer = document.getElementById('checkout-items-summary');
    if (summaryContainer) {
      summaryContainer.innerHTML = this.cart.map(item => {
        const prod = this.products.find(p => p.id === item.productId);
        if (!prod) return '';
        const unitPriceStr = this.formatPrice(prod.priceINR, prod.priceUSD);
        const lineTotalStr = this.formatPrice(
          prod.priceINR * item.quantity, 
          (prod.priceUSD || prod.priceINR * this.USD_CONVERSION_RATE) * item.quantity
        );
        return `
          <div class="checkout-summary-item">
            <img src="${prod.image}" alt="${prod.name}" class="checkout-item-thumb">
            <div class="checkout-item-text">
              <div class="checkout-item-name">${prod.name}</div>
              <div class="checkout-item-qty">${item.quantity} × ${unitPriceStr}</div>
            </div>
            <div class="checkout-item-price">${lineTotalStr}</div>
          </div>
        `;
      }).join('');
    }

    // Populate Cost Breakdown with active currency
    const subtotalEl = document.getElementById('checkout-subtotal-val');
    const discountEl = document.getElementById('checkout-discount-val');
    const discountRow = document.getElementById('checkout-discount-row');
    const deliveryEl = document.getElementById('checkout-delivery-val');

    if (subtotalEl) {
      subtotalEl.textContent = this.currency === 'INR' 
        ? `₹${Math.round(calc.subtotal)}` 
        : `$${calc.subtotal.toFixed(2)}`;
    }
    if (deliveryEl) {
      deliveryEl.textContent = calc.deliveryFee === 0 
        ? 'FREE' 
        : (this.currency === 'INR' ? `₹${calc.deliveryFee}` : `$${calc.deliveryFee.toFixed(2)}`);
    }
    if (discountRow && discountEl) {
      if (calc.discount > 0) {
        discountRow.style.display = 'flex';
        discountEl.textContent = this.currency === 'INR' 
          ? `-₹${Math.round(calc.discount)}` 
          : `-$${calc.discount.toFixed(2)}`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    // Reset overlay & screens
    document.getElementById('rzp-processing-overlay')?.classList.remove('active');
    document.getElementById('rzp-success-screen')?.classList.remove('active');
    const mainBody = document.getElementById('rzp-main-body');
    if (mainBody) mainBody.style.display = 'grid';

    modal.classList.add('active');
  }

  closeRazorpayModal() {
    const modal = document.getElementById('razorpay-modal');
    if (modal) modal.classList.remove('active');
  }

  openDevSettings() {
    const modal = document.getElementById('dev-settings-modal');
    if (modal) modal.classList.add('active');
  }

  closeDevSettings() {
    const modal = document.getElementById('dev-settings-modal');
    if (modal) modal.classList.remove('active');
  }

  async startLiveRazorpayCheckout() {
    const calc = this.getCartCalculations();
    if (calc.totalItems === 0) {
      this.showToast('Your cart is empty', 'fas fa-shopping-cart');
      return;
    }

    // Check if configured
    if (!this.razorpayConfig.isConfigured) {
      this.showToast('Razorpay API Keys required. Configure in Settings or .env', 'fas fa-key');
      this.openDevSettings();
      return;
    }

    // Customer info from form
    const name = document.getElementById('rzp-customer-name')?.value.trim() || 'Rahul Sharma';
    const phone = document.getElementById('rzp-customer-phone')?.value.trim() || '+91 98201 54321';
    const email = document.getElementById('rzp-customer-email')?.value.trim() || 'rahul.sharma@example.com';
    const address = document.getElementById('rzp-customer-address')?.value.trim() || 'Flat 402, Palm Grove, Bandra West, Mumbai';
    const slot = document.getElementById('rzp-customer-slot')?.value || 'Express Delivery';

    const orderAmount = this.currency === 'INR' 
      ? Math.round(calc.finalTotal) 
      : Number(calc.finalTotal.toFixed(2));
    const orderCurrency = this.currency;
    const receiptId = `rcpt_${Date.now().toString().slice(-6)}`;

    // Show processing status
    const overlay = document.getElementById('rzp-processing-overlay');
    const statusText = document.getElementById('rzp-processing-text');
    if (overlay && statusText) {
      overlay.classList.add('active');
      statusText.textContent = 'Calling Razorpay Orders API (/api/create-order)...';
    }

    try {
      // 1. Create Order on Backend via official Razorpay Orders API
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: orderAmount,
          currency: orderCurrency,
          receipt: receiptId,
          notes: {
            customer_name: name,
            customer_phone: phone,
            customer_email: email,
            delivery_address: address,
            delivery_slot: slot
          }
        })
      });

      const orderData = await res.json();

      if (!orderData.success) {
        if (overlay) overlay.classList.remove('active');
        this.showToast(`Order Creation Failed: ${orderData.message}`, 'fas fa-exclamation-triangle');
        if (orderData.error === 'MISSING_KEYS') {
          this.openDevSettings();
        }
        return;
      }

      console.log('[Razorpay] Order created on server:', orderData.order);
      if (overlay) overlay.classList.remove('active');

      // Close background modal to give official Razorpay checkout popup focus
      this.closeRazorpayModal();

      // Check if Razorpay SDK script is loaded
      if (typeof window.Razorpay === 'undefined') {
        this.showToast('Razorpay Checkout SDK not loaded. Check internet connection.', 'fas fa-times-circle');
        return;
      }

      // 2. Launch Official Razorpay Checkout Modal
      const options = {
        key: orderData.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "Verdant Organics",
        description: `Order #${orderData.order.receipt} - Produce Harvest`,
        image: "https://cdn.razorpay.com/static/assets/logo/rzp.png",
        order_id: orderData.order.id, // Official order_... ID generated by Razorpay
        prefill: {
          name: name,
          email: email,
          contact: phone
        },
        notes: {
          address: address,
          slot: slot
        },
        theme: {
          color: "#18181b"
        },
        modal: {
          ondismiss: () => {
            this.showToast('Razorpay Checkout window was closed', 'fas fa-info-circle');
          }
        },
        handler: (response) => {
          // 3. Payment Success callback: Verify HMAC-SHA256 signature on server!
          console.log('[Razorpay] Payment successful in widget, verifying signature:', response);
          this.verifyLivePayment(response, orderData.order, { name, phone, email, address, slot });
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response) => {
        console.error('[Razorpay] Payment Failed:', response.error);
        this.showToast(`Payment Failed: ${response.error.description || 'Card declined'}`, 'fas fa-times-circle');
      });

      rzp.open();

    } catch (err) {
      if (overlay) overlay.classList.remove('active');
      console.error('Checkout error:', err);
      this.showToast('Server communication failed while initiating Razorpay.', 'fas fa-times-circle');
    }
  }

  async verifyLivePayment(paymentResponse, originalOrder, customerInfo) {
    // Open modal to show verified success screen
    const modal = document.getElementById('razorpay-modal');
    const mainBody = document.getElementById('rzp-main-body');
    const overlay = document.getElementById('rzp-processing-overlay');
    const statusText = document.getElementById('rzp-processing-text');
    const successScreen = document.getElementById('rzp-success-screen');

    if (modal) modal.classList.add('active');
    if (mainBody) mainBody.style.display = 'none';
    if (overlay && statusText) {
      overlay.classList.add('active');
      statusText.textContent = 'Verifying HMAC-SHA256 Security Signature with Server...';
    }

    try {
      const res = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentResponse)
      });

      const verifyData = await res.json();
      if (overlay) overlay.classList.remove('active');

      if (verifyData.success) {
        // Set success details
        document.getElementById('rzp-confirmed-payment-id').textContent = `Payment ID: ${paymentResponse.razorpay_payment_id}`;
        document.getElementById('rzp-confirmed-order-id').textContent = originalOrder.id;
        document.getElementById('rzp-confirmed-recipient').textContent = `${customerInfo.name} (${customerInfo.phone})`;
        document.getElementById('rzp-confirmed-slot').textContent = customerInfo.slot;

        if (successScreen) successScreen.classList.add('active');

        // Confetti celebration
        this.triggerConfetti();

        // Clear Cart
        this.cart = [];
        this.saveCart();
        this.renderProducts();
        this.updateCartUI();
        this.showToast('Payment Verified & Order Confirmed via Razorpay!', 'fas fa-shield-check');
      } else {
        if (mainBody) mainBody.style.display = 'grid';
        this.showToast(`Verification Failed: ${verifyData.message}`, 'fas fa-times-circle');
      }
    } catch (e) {
      if (overlay) overlay.classList.remove('active');
      if (mainBody) mainBody.style.display = 'grid';
      this.showToast('Network error during payment verification', 'fas fa-times-circle');
    }
  }

  simulateRazorpayPayment(success = true) {
    const overlay = document.getElementById('rzp-processing-overlay');
    const statusText = document.getElementById('rzp-processing-text');
    if (overlay) overlay.classList.add('active');
    if (statusText) statusText.textContent = 'Simulating Offline Gateway Response...';

    setTimeout(() => {
      if (statusText) statusText.textContent = 'Verifying Bank Authentication Simulation...';
    }, 700);

    setTimeout(() => {
      if (overlay) overlay.classList.remove('active');

      if (success) {
        const paymentId = `pay_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
        const orderId = `order_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        document.getElementById('rzp-main-body').style.display = 'none';
        
        const successBox = document.getElementById('rzp-success-screen');
        if (successBox) successBox.classList.add('active');
        document.getElementById('rzp-confirmed-payment-id').textContent = `Payment ID: ${paymentId}`;
        document.getElementById('rzp-confirmed-order-id').textContent = orderId;
        
        // Trigger celebratory confetti effect
        this.triggerConfetti();

        // Clear cart
        this.cart = [];
        this.saveCart();
        this.renderProducts();
        this.updateCartUI();
        this.showToast('Simulated Order Placed Successfully!', 'fas fa-shield-check');
      } else {
        this.showToast('Simulated payment declined by bank. Please try again.', 'fas fa-exclamation-triangle');
      }
    }, 1500);
  }

  triggerConfetti() {
    const container = document.body;
    for (let i = 0; i < 40; i++) {
      const conf = document.createElement('div');
      conf.className = 'confetti-particle';
      const colors = ['#10b981', '#3395ff', '#f59e0b', '#ef4444', '#8b5cf6'];
      conf.style.cssText = `
        position: fixed;
        width: ${Math.random() * 8 + 6}px;
        height: ${Math.random() * 12 + 6}px;
        background-color: ${colors[Math.floor(Math.random() * colors.length)]};
        top: -20px;
        left: ${Math.random() * 100}vw;
        opacity: ${Math.random() + 0.5};
        transform: rotate(${Math.random() * 360}deg);
        z-index: 9999;
        pointer-events: none;
        transition: transform 3s ease-out, top 3s ease-out, opacity 3s ease-out;
      `;
      container.appendChild(conf);

      setTimeout(() => {
        conf.style.top = `${Math.random() * 50 + 60}vh`;
        conf.style.transform = `rotate(${Math.random() * 720}deg) scale(0.6)`;
        conf.style.opacity = '0';
      }, 50);

      setTimeout(() => conf.remove(), 3200);
    }
  }

  // ================= TOAST NOTIFICATIONS =================
  showToast(message, iconClass = 'fas fa-info-circle') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <i class="${iconClass} toast-icon"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // ================= EVENT LISTENERS =================
  setupEventListeners() {
    // Currency toggles
    document.querySelectorAll('.currency-opt').forEach(btn => {
      btn.addEventListener('click', () => this.setCurrency(btn.dataset.curr));
    });

    // Search bar
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (searchClear) searchClear.style.display = this.searchQuery ? 'block' : 'none';
        this.renderProducts();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        this.renderProducts();
      });
    }

    // Sort dropdown
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.renderProducts();
    });

    // Organic filter chip
    const organicChip = document.getElementById('filter-organic-chip');
    if (organicChip) {
      organicChip.addEventListener('click', () => {
        this.filterOrganicOnly = !this.filterOrganicOnly;
        organicChip.classList.toggle('active', this.filterOrganicOnly);
        this.renderProducts();
      });
    }

    // Cart trigger buttons
    document.getElementById('header-cart-btn')?.addEventListener('click', () => this.openCart());
    document.getElementById('drawer-close-btn')?.addEventListener('click', () => this.closeCart());
    document.getElementById('drawer-backdrop')?.addEventListener('click', () => this.closeCart());

    // Promo code apply button
    document.getElementById('apply-promo-btn')?.addEventListener('click', () => {
      const code = document.getElementById('promo-input-field')?.value;
      this.applyPromo(code);
    });

    // Quick promo pills
    document.getElementById('promo-hint-20')?.addEventListener('click', () => {
      const input = document.getElementById('promo-input-field');
      if (input) input.value = 'FRESH20';
      this.applyPromo('FRESH20');
    });

    // Modal close buttons
    document.getElementById('quickview-close-btn')?.addEventListener('click', () => this.closeQuickView());
    document.getElementById('quickview-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'quickview-modal') this.closeQuickView();
    });

    // Checkout triggers
    document.getElementById('btn-start-checkout')?.addEventListener('click', () => this.openRazorpayModal());
    document.getElementById('rzp-close-btn')?.addEventListener('click', () => this.closeRazorpayModal());
    document.getElementById('razorpay-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'razorpay-modal') this.closeRazorpayModal();
    });

    // Live Razorpay API Launch button
    document.getElementById('rzp-pay-live-btn')?.addEventListener('click', () => this.startLiveRazorpayCheckout());

    // Finish / continue shopping button
    document.getElementById('rzp-finish-btn')?.addEventListener('click', () => this.closeRazorpayModal());

    // Developer API Settings Modal triggers
    document.getElementById('open-api-settings-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openDevSettings();
    });
    document.getElementById('dev-settings-close-btn')?.addEventListener('click', () => this.closeDevSettings());
    document.getElementById('dev-settings-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'dev-settings-modal') this.closeDevSettings();
    });
    document.getElementById('rzp-save-keys-btn')?.addEventListener('click', () => this.saveRazorpayKeys());

    // Newsletter submit
    document.getElementById('newsletter-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('newsletter-email');
      if (input && input.value) {
        this.showToast('Thank you! Welcome coupon sent to your email.', 'fas fa-check');
        input.value = '';
      }
    });

    // Keyboard ESC to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeQuickView();
        this.closeRazorpayModal();
        this.closeDevSettings();
        this.closeCart();
      }
    });
  }
}

// Instantiate App on DOM ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new GroceryApp();
});
