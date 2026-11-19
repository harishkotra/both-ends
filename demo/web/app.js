// Desktop surface logic. Deliberately boring: one cart, one promo rule, one
// total. The numbers come from the server so the phone and the browser cannot
// disagree about the menu — only about how they apply it.
const money = (n) => `$${Number(n).toFixed(2)}`;

const state = { menu: null, lines: [], promo: null, order: null };

const $ = (id) => document.getElementById(id);

async function boot() {
  state.menu = await fetch('/api/menu').then((r) => r.json());
  $('price-bowl').textContent = money(state.menu.items[0].price);
  $('price-tea').textContent = money(state.menu.items[1].price);
}

function subtotal() {
  return state.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

function discount() {
  if (!state.promo) return 0;
  return Math.round(subtotal() * (state.promo.percent / 100) * 100) / 100;
}

function addItem(id) {
  const item = state.menu.items.find((i) => i.id === id);
  if (!item) return;
  const line = state.lines.find((l) => l.id === id);
  if (line) line.qty += 1;
  else state.lines.push({ ...item, qty: 1 });
  render();
}

function render() {
  const count = state.lines.reduce((n, l) => n + l.qty, 0);
  $('cart-count').textContent = String(count);
  $('cart-count').setAttribute('aria-label', `${count} items in cart`);

  $('lines').innerHTML = state.lines
    .map(
      (l) =>
        `<li><span>${l.name}</span><span class="qty">×${l.qty}</span><span class="line-total">${money(l.price * l.qty)}</span></li>`,
    )
    .join('');

  const sub = subtotal();
  const disc = discount();
  $('subtotal').textContent = money(sub);
  $('discount').textContent = `−${money(disc)}`;
  $('discount-row').hidden = !state.promo;
  $('total').textContent = money(sub - disc);
  $('place-order').disabled = state.lines.length === 0;
}

function showCart(show) {
  $('cart').hidden = !show;
  if (show) $('cart').scrollIntoView({ block: 'nearest' });
}

document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    addItem(add.dataset.add);
    showCart(true);
    return;
  }
  if (e.target.closest('#open-cart')) return showCart(true);
  if (e.target.closest('#close-cart')) return showCart(false);
  if (e.target.closest('#accept-cookies')) {
    $('cookie').remove();
    return;
  }
  if (e.target.closest('#start-over')) {
    state.lines = [];
    state.promo = null;
    state.order = null;
    $('confirm').hidden = true;
    $('promo').value = '';
    $('promo-note').textContent = '';
    render();
    showCart(false);
  }
});

$('promo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('promo').value.trim().toUpperCase();
  const note = $('promo-note');
  if (code === state.menu.promo.code) {
    state.promo = state.menu.promo;
    note.textContent = `${state.menu.promo.label} applied`;
    note.classList.remove('bad');
  } else {
    state.promo = null;
    note.textContent = code ? `${code} is not a valid code` : 'Enter a code to see the discount';
    note.classList.add('bad');
  }
  render();
});

$('place-order').addEventListener('click', async () => {
  const sub = subtotal();
  const disc = discount();
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subtotal: sub, discount: disc, promo: state.promo?.code ?? null, lines: state.lines }),
  });
  const order = await res.json();
  state.order = order;
  $('order-id').textContent = order.id;
  $('order-total').textContent = `Total ${money(order.total)}`;
  $('confirm').hidden = false;
  showCart(false);
  $('confirm').scrollIntoView({ block: 'center' });
});

boot().then(render);
