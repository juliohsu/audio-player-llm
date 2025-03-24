import React from 'react';

const Cart = ({ items }) => {
  if (!items || items.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No items in cart yet. Start your order by speaking!
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Your Order</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between items-center p-2 bg-white rounded shadow"
          >
            <div>
              <span className="font-medium">{item.name}</span>
              <span className="text-sm text-gray-500 ml-2">x{item.quantity}</span>
            </div>
            <div className="text-right">
              <div className="font-medium">${(item.price * item.quantity).toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between font-semibold">
          <span>Total:</span>
          <span>
            ${items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Cart; 