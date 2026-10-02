import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Candidates from './pages/Candidates'
import UploadPage from './pages/Upload'
import Requirements from './pages/Requirements'
import SearchPage from './pages/SearchPage'
import Processing from './pages/Processing'
import Settings from './pages/Settings'
import Layout from './components/Layout'
import CandidateProfile from './pages/CandidateProfile'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/candidates"
          element={
            <PrivateRoute>
              <Layout>
                <Candidates />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/candidates/:id"
          element={
            <PrivateRoute>
              <Layout>
                <CandidateProfile />
              </Layout>
            </PrivateRoute>
           }
        />

        <Route
          path="/upload"
          element={
            <PrivateRoute>
              <Layout>
                <UploadPage />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/requirements"
          element={
            <PrivateRoute>
              <Layout>
                <Requirements />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/search"
          element={
            <PrivateRoute>
              <Layout>
                <SearchPage />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/processing"
          element={
            <PrivateRoute>
              <Layout>
                <Processing />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <Layout>
                <Settings />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App