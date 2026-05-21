import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';

// Fix for default marker icons in Leaflet with Webpack/Vite
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const LocationMapModal = ({ isOpen, onClose, location }) => {
  if (!isOpen || !location) return null;

  const position = [parseFloat(location.lat), parseFloat(location.lng)];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300 h-[80vh] flex flex-col">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-white shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-xl">
              Location Preview: {location.name}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{location.address}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>
        
        <div className="flex-1 relative">
          <MapContainer 
            center={position} 
            zoom={16} 
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={position}>
              <Popup>
                <div className="p-1">
                  <p className="font-bold text-slate-800">{location.name}</p>
                  <p className="text-xs text-slate-500">{location.radius}m Radius</p>
                </div>
              </Popup>
            </Marker>
            <Circle 
              center={position}
              radius={parseFloat(location.radius)}
              pathOptions={{ color: '#006C49', fillColor: '#006C49', fillOpacity: 0.2 }}
            />
          </MapContainer>
        </div>
        
        <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0 flex justify-between items-center">
          <div className="flex gap-6">
            <div className="text-xs">
              <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">Latitude</p>
              <p className="text-slate-800 font-medium">{location.lat}</p>
            </div>
            <div className="text-xs">
              <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">Longitude</p>
              <p className="text-slate-800 font-medium">{location.lng}</p>
            </div>
            <div className="text-xs">
              <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">Radius</p>
              <p className="text-slate-800 font-medium">{location.radius} Meters</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="px-8 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-all"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationMapModal;
