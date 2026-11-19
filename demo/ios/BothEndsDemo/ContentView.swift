import SwiftUI

struct ContentView: View {
    @State private var cart = Cart()
    @State private var promoField = ""
    @State private var promoNote = ""
    @State private var showCart = false
    @State private var orderId: String?
    @State private var orderTotal: Double = 0
    @State private var showUpdatesPrompt = true
    @FocusState private var promoFocused: Bool

    private let ink = Color(red: 0.078, green: 0.067, blue: 0.059)
    private let paper = Color(red: 0.969, green: 0.953, blue: 0.925)
    private let saffron = Color(red: 0.847, green: 0.325, blue: 0.122)
    private let line = Color(red: 0.886, green: 0.851, blue: 0.796)

    var body: some View {
        ZStack(alignment: .top) {
            paper.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    masthead
                    if showUpdatesPrompt { updatesPrompt }
                    ForEach(MenuItem.all) { item in dish(item) }
                    if showCart { cartPanel }
                    if let id = orderId { confirmation(id) }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .preferredColorScheme(.light)
    }

    private var masthead: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Saffron & Rye").font(.system(size: 22, weight: .semibold, design: .serif)).foregroundStyle(ink)
                Text("Lunch, resolved.").font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                showCart = true
            } label: {
                HStack(spacing: 6) {
                    Text("Cart")
                    Text("\(cart.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(saffron, in: Capsule())
                }
                .font(.subheadline)
                .padding(.vertical, 8)
                .padding(.horizontal, 14)
                .background(Color.white, in: Capsule())
                .overlay(Capsule().stroke(line))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("open-cart")
            .accessibilityLabel("Open cart, \(cart.count) items")
        }
    }

    private var updatesPrompt: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("Turn on order updates?").font(.subheadline)
            Spacer(minLength: 8)
            Button("Not now") { showUpdatesPrompt = false }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("updates-not-now")
            Button("Allow") { showUpdatesPrompt = false }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(saffron, in: Capsule())
                .accessibilityIdentifier("updates-allow")
        }
        .padding(14)
        .background(ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
    }

    private func dish(_ item: MenuItem) -> some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 14)
                .fill(LinearGradient(colors: [Color(red: 0.96, green: 0.79, blue: 0.54), Color(red: 0.88, green: 0.57, blue: 0.34)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name).font(.headline).foregroundStyle(ink)
                Text(item.note).font(.caption).foregroundStyle(.secondary)
                HStack {
                    Text(money(item.price)).font(.subheadline.monospacedDigit())
                    Spacer()
                    Button("Add to cart") { cart.add(item); showCart = true }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(ink, in: Capsule())
                        .accessibilityIdentifier("add-\(item.id)")
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(line))
    }

    private var cartPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Your cart").font(.headline)
                Spacer()
                Button("Keep browsing") { showCart = false }
                    .font(.footnote).foregroundStyle(.secondary)
                    .accessibilityIdentifier("close-cart")
            }

            ForEach(cart.lines) { l in
                HStack {
                    Text(l.item.name).font(.subheadline)
                    Text("×\(l.qty)").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(money(l.lineTotal)).font(.subheadline.monospacedDigit())
                }
            }

            HStack(spacing: 8) {
                TextField("Promo code", text: $promoField)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(.subheadline, design: .monospaced))
                    .padding(10)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(line))
                    .accessibilityIdentifier("promo-field")
                    .accessibilityLabel("Promo code")
                    .focused($promoFocused)
                    .submitLabel(.done)
                    .onSubmit { applyPromo() }
                Button("Apply") { applyPromo() }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(ink))
                    .accessibilityIdentifier("apply-promo")
            }

            if !promoNote.isEmpty {
                Text(promoNote).font(.caption).foregroundStyle(cart.promoApplied ? .green : .red)
            }

            VStack(spacing: 8) {
                row("Subtotal", money(cart.subtotal))
                if cart.promoApplied {
                    row("Discount", "−" + money(cart.discount), id: "discount")
                }
                Divider()
                row("Total", money(cart.total), bold: true, id: "total")
            }

            Button {
                placeOrder()
            } label: {
                Text("Place order")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(cart.lines.isEmpty ? Color.gray.opacity(0.35) : saffron, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .disabled(cart.lines.isEmpty)
            .accessibilityIdentifier("place-order")
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(line))
    }

    private func row(_ label: String, _ value: String, bold: Bool = false, id: String? = nil) -> some View {
        HStack {
            Text(label).foregroundStyle(bold ? ink : .secondary)
            Spacer()
            Text(value).monospacedDigit()
                .accessibilityIdentifier((id ?? label.lowercased()) + "-value")
        }
        .font(bold ? .headline : .subheadline)
        .accessibilityIdentifier(id ?? label.lowercased())
        .accessibilityValue(value)
    }

    private func confirmation(_ id: String) -> some View {
        VStack(spacing: 6) {
            Text("CONFIRMED").font(.caption2).tracking(2).foregroundStyle(.secondary)
            Text(id).font(.system(size: 28, weight: .semibold, design: .monospaced)).foregroundStyle(ink)
                .accessibilityIdentifier("order-id")
            Text("Total \(money(orderTotal))").font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(line))
    }

    private func applyPromo() {
        promoFocused = false
        let code = promoField.trimmingCharacters(in: .whitespaces).uppercased()
        if code == Promo.code {
            cart.promoApplied = true
            promoNote = "\(Promo.label) applied"
        } else {
            cart.promoApplied = false
            promoNote = code.isEmpty ? "Enter a code to see the discount" : "\(code) is not a valid code"
        }
    }

    private func placeOrder() {
        let seq = UserDefaults.standard.integer(forKey: "orders") + 1
        UserDefaults.standard.set(seq, forKey: "orders")
        orderTotal = cart.total
        orderId = String(format: "BE-%d", 1042 + seq)
        showCart = false
    }
}

#Preview {
    ContentView()
}
