import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Chat from "./Chat"

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <Routes>
      <Route path="/chat/:sessionId" element={<Chat />} />
      <Route path="*" element={<Chat />} />
    </Routes>
  </HashRouter>
)
