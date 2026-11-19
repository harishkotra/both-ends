---
id: place-order-two-ends
title: Place an order and read the total back
surfaces: desktop, simulator
url: http://127.0.0.1:4173
app: demo/build/Build/Products/Debug-iphonesimulator/BothEndsDemo.app
device: iPhone 18 Pro
appium: http://127.0.0.1:4723
timeout: 240
maxSteps: 45
policy: policies/both-ends.yaml
---

## Why this journey exists

The same order, on a phone and on the web, has to end at the same number.
Every "it works on my machine" report about a payment total starts here.

## Objective

### desktop

Open {{url}} in the browser. Add one Signature Bowl to the cart, open the cart,
enter the promo code HACK25 and apply it. Read the totals: the cart should show a
discount of 6.25 and an order total of 18.75. Continue to checkout, place the
order, and confirm the confirmation screen shows an order number.

### simulator

Launch the Both Ends Demo app on the phone. Add one Signature Bowl to the cart,
open the cart, enter the promo code HACK25 and apply it. Read the totals: the cart
should show a discount of 6.25 and an order total of 18.75. Continue to checkout,
place the order, and confirm the confirmation screen shows an order number.

## Steps

1. anchor: cart badge shows 1 item
   desktop: the cart badge shows 1 item
   simulator: the cart badge shows 1 item
2. anchor: promo code HACK25 shown as applied
   desktop: the promo code HACK25 is shown as applied
   simulator: the promo code HACK25 is shown as applied
3. anchor: subtotal shows 25.00
   desktop: the subtotal shows 25.00
   simulator: the subtotal shows 25.00
4. anchor: discount line shows 6.25
   desktop: the cart shows a discount of 6.25
   simulator: the cart shows a discount of 6.25
5. anchor: order total shows 18.75
   desktop: the order total shows 18.75
   simulator: the order total shows 18.75
6. anchor: confirmation shows an order number
   desktop: the confirmation shows an order number starting with BE-
   simulator: the confirmation shows an order number starting with BE-
