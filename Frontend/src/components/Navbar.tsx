import { FC, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";
import LoginModal from "../scenes/Authentication/LoginModal";
import SignupModal from "../scenes/Authentication/SignupModal";

const Navbar: FC = () => {
    const { currUser, logout } = useAuth();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);

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
    ]

    const handleLogout = () => {
        logout();
        navigate("/");
    }


    return (
        <div className="bg-lightBlue pt-6">
            <div className="flex justify-between bg-white py-4   mx-30 rounded-full ">
                <div className="text-3xl ml-12 font-semibold text-gray-800 mt-1">Neuro<span className="">Lens</span></div>
                <ul className="flex justify-between gap-16 mt-2 ml-12">
                    {
                        navItems.map(({ link, path }) => (
                            <li key={path} className="text-xl font-medium text-gray-900 tranistion-all duration-200">
                                <Link to={path} className="hover:text-Blue" >{link}</Link>
                            </li>
                        ))
                    }
                </ul>
                <div className="px-8">
                    {
                        currUser ?
                            <button onClick={handleLogout} className=" text-black px-6 py-2 rounded-full bg-gray-200 text-xl hover:scale-90 hover:transition-all duration-300">Logout</button>
                            :
                            <div className="flex">
                                <button onClick={() => setIsSignupModalOpen(true)} className="text-xl font-medium mr-2 px-6 hover:rounded-full hover:bg-gray-200 hover:scale-90 transition-all duration-300  py-2 transition-all duration-200 text-black " >Signup</button>
                                <button onClick={() => setIsModalOpen(true)} className="text-black px-6 py-2 text-xl bg-gray-200 rounded-full hover:scale-90 transition-all duration-300">Login</button>
                            </div>
                    }
                </div>
            </div>
            {isModalOpen && <LoginModal onClose={() => setIsModalOpen(false)} />}
            {isSignupModalOpen && <SignupModal onClose={() => setIsSignupModalOpen(false)} />}
        </div>
    )
}

export default Navbar