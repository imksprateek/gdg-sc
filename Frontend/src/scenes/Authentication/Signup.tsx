import React, { FC, useState } from "react";
import { useAuth } from "../../contexts/AuthProvider";
import { useNavigate } from "react-router-dom";

interface SignupProps {
    onSignupSuccess?: () => void;
}

type UserRole = "user" | "admin";

const Signup: FC<SignupProps> = ({ onSignupSuccess }) => {
    const { signup } = useAuth();
    const [error, setError] = useState<string>("");
    const navigate = useNavigate();

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const email = (form.elements.namedItem("email") as HTMLInputElement).value;
        const password = (form.elements.namedItem("password") as HTMLInputElement).value;
        const name = (form.elements.namedItem("name") as HTMLInputElement).value;
        const roleValue = (form.elements.namedItem("role") as HTMLSelectElement).value;
        console.log(email);
        console.log(roleValue);
        if (roleValue !== "user" && roleValue !== "admin") {
            setError("Invalid role selected");
            return;
        }
        const role: UserRole = roleValue as UserRole;

        try {
            if (!email || !password || !name || !roleValue) {
                setError("All fields are required");
                return;
            }
            await signup(name, email, password, role);
            if (onSignupSuccess) onSignupSuccess();
            navigate("/", { replace: true });
        } catch (error) {
            setError("Signup failed, please try again");
        }
    }
    return (
        <div className="flex items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 space-y-6 border border-gray-200">
                <h1 className="text-3xl font-extrabold text-center text-gray-800">Create an Account</h1>
                {error && <p className="text-center text-red-500">{error}</p>}

                <form onSubmit={handleSignup} className="space-y-4">
                    <div className="flex flex-col">
                        <label className="font-semibold text-gray-700">Name</label>
                        <input
                            type="text"
                            name="name"
                            placeholder="Enter your name"
                            className="p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                            required
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="font-semibold text-gray-700">Email</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter your email"
                            className="p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                            required
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="font-semibold text-gray-700">Password</label>
                        <input
                            type="password"
                            name="password"
                            placeholder="Enter your password"
                            className="p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                            required
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="font-semibold text-gray-700">Role</label>
                        <select
                            name="role"
                            className="p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                            required
                        >
                            <option value="">Select a role</option>
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="ml-32 w-1/3 bg-Blue/90 hover:bg-Blue/80 text-black font-bold py-3 rounded-lg shadow-md transition transform hover:scale-95"
                    >
                        Register
                    </button>
                </form>
            </div>
        </div>
    )
}

export default Signup