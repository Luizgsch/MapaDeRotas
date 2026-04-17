import { createRoot } from 'react-dom/client'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import App from './App.tsx'

/* StrictMode desativado: o double-mount em dev quebra o ciclo de vida do Leaflet (mapa em branco). */
createRoot(document.getElementById('root')!).render(<App />)
