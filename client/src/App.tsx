import { Navigate, Route, Routes } from 'react-router-dom'
import PortalLayout from './layouts/PortalLayout'
import ProtectedRoute from './routes/ProtectedRoute'
import RequireVerified from './routes/RequireVerified'
import ComingSoon from './pages/ComingSoon'
import Dashboard from './pages/Dashboard'
import Notifications from './pages/Notifications'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import Verifications from './pages/admin/Verifications'
import Crops from './pages/farmer/Crops'
import Prices from './pages/farmer/Prices'
import MarketPrices from './pages/admin/MarketPrices'
import Users from './pages/admin/Users'
import Listings from './pages/admin/Listings'
import Vehicle from './pages/transporter/Vehicle'
import Vehicles from './pages/Vehicles'
import ForgotPassword from './pages/ForgotPassword'
import BuyerWanted from './pages/buyer/Wanted'
import FarmerWanted from './pages/farmer/Wanted'
import Leftover from './pages/farmer/Leftover'
import Reports from './pages/admin/Reports'
import Insights from './pages/Insights'
import CropForm from './pages/farmer/CropForm'
import Marketplace from './pages/buyer/Marketplace'
import MarketDetail from './pages/buyer/MarketDetail'
import RequestList from './pages/RequestList'
import RequestDetail from './pages/RequestDetail'
import OrderList from './pages/OrderList'
import OrderDetail from './pages/OrderDetail'
import TransportPage from './pages/Transport'
import type { Role } from './context/AuthContext'
import { T } from './i18n'

const portals: Role[] = ['farmer', 'buyer', 'transporter', 'admin']

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {portals.map((role) => (
        <Route key={role} element={<ProtectedRoute role={role} />}>
          <Route path={`/${role}`} element={<PortalLayout />}>
            {/* Always available, even before admin verification */}
            <Route index element={<Dashboard />} />
            {role !== 'admin' && <Route path="profile" element={<Profile />} />}
            <Route path="notifications" element={<Notifications />} />
            {role === 'admin' && <Route path="verifications" element={<Verifications />} />}
            {role === 'admin' && <Route path="prices" element={<MarketPrices />} />}
            {role === 'admin' && <Route path="users" element={<Users />} />}
            {role === 'admin' && <Route path="reports" element={<Reports />} />}
            {role === 'admin' && <Route path="listings" element={<Listings />} />}

            {/* Everything else unlocks only after admin verification */}
            <Route element={<RequireVerified />}>
              {role === 'farmer' && (
                <>
                  <Route path="crops" element={<Crops />} />
                  <Route path="prices" element={<Prices />} />
                  <Route path="insights" element={<Insights />} />
                  <Route path="crops/new" element={<CropForm />} />
                  <Route path="crops/:id/edit" element={<CropForm />} />
                  <Route path="crops/:id/leftover" element={<Leftover />} />
                  <Route path="requests" element={<RequestList />} />
                  <Route path="requests/:id" element={<RequestDetail />} />
                  <Route path="orders" element={<OrderList title={T("Orders")} subtitle={T("Active orders to prepare and deliver.")} />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
                  <Route path="sales" element={<OrderList title={T("Sales History")} subtitle={T("Everything you have sold, with totals.")} initialTab="history" />} />
                  <Route path="transport" element={<TransportPage />} />
                  <Route path="vehicles" element={<Vehicles />} />
                  <Route path="wanted" element={<FarmerWanted />} />
                </>
              )}
              {role === 'buyer' && (
                <>
                  <Route path="marketplace" element={<Marketplace />} />
                  <Route path="marketplace/:id" element={<MarketDetail />} />
                  <Route path="orders" element={<OrderList title={T("Orders & Purchase History")} subtitle={T("Track your orders and see everything you have bought.")} />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
                  <Route path="transport" element={<TransportPage />} />
                  <Route path="vehicles" element={<Vehicles />} />
                  <Route path="wanted" element={<BuyerWanted />} />
                  <Route path="requests" element={<RequestList />} />
                  <Route path="requests/:id" element={<RequestDetail />} />
                  <Route path="insights" element={<Insights />} />
                </>
              )}
              {role === 'transporter' && <Route path="requests" element={<TransportPage />} />}
              {role === 'transporter' && <Route path="vehicles" element={<Vehicle />} />}
              <Route path="*" element={<ComingSoon />} />
            </Route>
          </Route>
        </Route>
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
