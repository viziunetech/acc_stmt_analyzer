import React from 'react';

const Card = ({ children, style }) => (
  <div className="card" style={style}>
    {children}
  </div>
);

export default Card;
