import { FC, useState } from "react"
import { useAuth } from "../../contexts/AuthProvider";
import { useNavigate } from "react-router-dom";

interface LoginProps {
    onLoginSuccess?: () => void;
}

const Login: FC<LoginProps> = ({ onLoginSuccess }) => {
    const { login } = useAuth();
    const [error, setError] = useState<string>("");
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const email = (form.elements.namedItem("email") as HTMLInputElement).value;
        const password = (form.elements.namedItem("password") as HTMLInputElement).value;

        try {
            if (!email || !password) {
                setError("All fields are required");
            }
            await login(email, password);
            if (onLoginSuccess) onLoginSuccess();
            navigate("/", { replace: true });
        } catch (error) {
            setError("login failed please try again");
        }
    };

    return (
        <div className=" flex justify-center items-center  ">
            <div className=" w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
                <div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">
                        Welcome Back!
                    </h2>
                    <p className="mt-3 text-center text-lg font-medium text-gray-600">
                        Sign in to continue exploring{" "}
                        <span className="text-Blue font-medium">NeuroLens</span>
                    </p>
                </div>
                <form onSubmit={handleLogin} className="mt-8 space-y-6  ">
                    <div className="rounded-md  space-y-4 flex flex-col">
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-lg font-bold text-gray-700"
                            >
                                Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                id="email"
                                placeholder="Enter your email"
                                className="appearance-none rounded-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition  sm:text-sm"
                                required
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-lg font-bold text-gray-700"
                            >
                                Password
                            </label>
                            <input
                                type="password"
                                name="password"
                                id="password"
                                placeholder="Enter your password"
                                className="appearance-none rounded-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition sm:text-sm"
                                required
                            />
                        </div>
                    </div>
                    <div >
                        <button
                            type="submit"
                            className="flex ml-40 justify-center py-2 px-6 border border-transparent text-md bg-gray-200 rounded-full hover:scale-95 hover:transition-all duration-300 font-medium text-black "
                        >
                            Login
                        </button>
                    </div>
                </form>
                {error && (
                    <div className="text-red-600 text-center text-sm mt-4">
                        {error}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Login