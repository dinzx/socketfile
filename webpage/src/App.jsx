import { Route, Routes } from "react-router-dom";
import "./App.css";
import { Navbar } from "./components/Navbar";
import { Home } from "./components/pages/Home";
import { ClientManager } from "./components/pages/ClientManager";
import { FileUpload } from "./components/pages/FileUpload/FileUpload";

function App() {
  return (
    <div className="App">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/clients" element={<ClientManager />} />
        <Route path="/file upload" element={<FileUpload />} />
      </Routes>
    </div>
  );
}

export default App;
