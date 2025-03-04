import { motion } from "framer-motion";
import { FC, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";
import LoginModal from "../scenes/Authentication/LoginModal";
import SignupModal from "../scenes/Authentication/SignupModal";

const Navbar: FC = () => {
    const {currUser,logout}=useAuth();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSignupModalOpen,setIsSignupModalOpen]=useState(false);

    const navItems = [
        {
            link: "Home", path: "/"
        },
        {
            link: "About", path: "/about"
        },
        {
            link: "Dashboard", path: "/dashboard/home",
        },
        {
            link: "Pricing", path: "/pricing",
        }
    ]

    const handleLogout = () => {
        logout();
        navigate("/");  
    }


    return (
        <>
            <motion.div className="flex justify-between bg-white py-4 px-10"
                initial={{ transform: "translateY(-100px)" }}
                animate={{ transform: "translateY(0px)" }}
                transition={{ type: "spring" }}
            >
                <div className="text-3xl ml-20 font-semibold text-gray-900 mt-1">Neuro<span className="text-Blue">Lens</span></div>
                <ul className="flex justify-between gap-16 mt-2 ml-12">
                    {
                        navItems.map(({ link, path }) => (
                            <li key={path} className="text-xl font-medium text-gray-900 tranistion-all duration-200">
                                <Link to={path} className="hover:text-Blue" >{link}</Link>
                            </li>
                        ))
                    }
                </ul>
                <div className="mr-20">
                    {
                        currUser ?
                            <button onClick={handleLogout} className="bg-Blue text-black px-6 py-2 rounded-lg text-xl hover:bg-Blue/80 transtion-all duration-300 hover:tranistion-all duration-300 ">Logout</button>
                            :
                            <div className="flex">
                                <button onClick={() => setIsSignupModalOpen(true)} className="text-xl font-medium mr-10 px-6 py-2 transition-all duration-200 text-black rounded-lg hover:bg-Blue/90 hover:text-white hover:transition-all hover:duration-200 hover:ease-in-out   " >Signup</button>
                                <button onClick={() => setIsModalOpen(true)} className="bg-Blue text-black px-6 py-2 rounded-lg text-xl hover:bg-Blue/80 transtion-all duration-300 hover:tranistion-all duration-300 ">Login</button>
                            </div>
                    }
                </div>
            </motion.div>
            {isModalOpen && <LoginModal onClose={() => setIsModalOpen(false)} />}
            {isSignupModalOpen && <SignupModal onClose={()=>setIsSignupModalOpen(false)}/>}    
        </>
    )
}

export default Navbar