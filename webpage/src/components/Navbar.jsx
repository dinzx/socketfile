import React, { useState } from "react";

import "./Navbar.css";
import { Link, NavLink } from "react-router-dom";
import logo from './F5qFaAnbgAAWjNX.jpg';  // Import the logo

export const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav>
      <div className="navbar-logo">
                <img src={logo} alt="Logo" className="logo" />
            </div>
      <Link to="/" className="title">
        File Sharing Website
      </Link>
      <div className="menu" onClick={() => setMenuOpen(!menuOpen)}>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <ul className={menuOpen ? "open" : ""}>
        <li>
          <NavLink to="/home">Home</NavLink>
        </li>
        <li>
          <NavLink to="/clients">Clients</NavLink>
        </li>
        <li>
          <NavLink to="/file upload">File Upload</NavLink>
        </li>
      </ul>
    </nav>
  );
};
