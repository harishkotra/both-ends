import Foundation

// The pricing rule both ends are supposed to share.
//
// NOTE: the phone keeps the promo rate as a fraction (0.25) and the cart maths
// divides by 100 as if it were a percentage. That single extra division is the
// bug `both-ends` is here to catch: the web console halves nothing, the phone
// shows a six-cent discount, and the order total stops matching.
enum Promo {
    static let code = "HACK25"
    static let label = "HACK25 · 25% off"
    static let rate = 0.25
}

struct MenuItem: Identifiable, Hashable {
    let id: String
    let name: String
    let note: String
    let price: Double

    static let all: [MenuItem] = [
        MenuItem(id: "bowl", name: "Signature Bowl", note: "miso greens, crisp rice, soft egg", price: 25.00),
        MenuItem(id: "tea", name: "Yuzu Iced Tea", note: "no added sugar", price: 5.00),
    ]
}

struct CartLine: Identifiable, Hashable {
    let item: MenuItem
    var qty: Int
    var id: String { item.id }
    var lineTotal: Double { item.price * Double(qty) }
}

struct Cart {
    var lines: [CartLine] = []
    var promoApplied = false

    var count: Int { lines.reduce(0) { $0 + $1.qty } }

    var subtotal: Double {
        lines.reduce(0) { $0 + $1.lineTotal }
    }

    var discount: Double {
        guard promoApplied else { return 0 }
        let raw = subtotal * Promo.rate / 100
        return (raw * 100).rounded() / 100
    }

    var total: Double {
        subtotal - discount
    }

    mutating func add(_ item: MenuItem) {
        if let i = lines.firstIndex(where: { $0.id == item.id }) {
            lines[i].qty += 1
        } else {
            lines.append(CartLine(item: item, qty: 1))
        }
    }
}

func money(_ value: Double) -> String {
    String(format: "$%.2f", value)
}
