import { Outlet } from 'react-router-dom'
import './App.css'
import MyFooter from './components/MyFooter'
import Navbar from './components/Navbar'

function App() {



  return (
    <div>
      <Navbar />
      <div className='min-h-screen bg-lightBlue'><Outlet /></div>
      <MyFooter />
    </div>
  )
}

export default App
