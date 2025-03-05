import { motion } from "motion/react";
import { HoverBorderGradient } from "../../components/ui/hover-border-gradient";


export function HoverBorderGradientDemo() {
    return (
        <div className=" flex justify-center text-center">
            <HoverBorderGradient
                containerClassName="rounded-full"
                as="button"
                className="dark:bg-black bg-white text-black dark:text-white flex items-center px-8"
            >
                <span>Join the Beta</span>
            </HoverBorderGradient>
        </div>
    );
}



const Home = () => {
    return (
        <div className="">
            <motion.div className="text-center" initial={{ scale: 0.6 }} animate={{ scale: 1, transition: { duration: 0.3, type: "tween" } }}>
                <h1 className="text-6xl font-medium text-gray-800 px-[200px] pt-[100px] pb-8  ">
                    The <span className="font-bold tracking-tight bg-gradient-to-r from-darkBlue to-LightBlue bg-clip-text text-transparent">AI-Powered</span> Platform for {" "} Neurodiverse Assistance
                </h1>

                <p className="text-gray-400 text-xl mt-4 px-[250px]">
                    Neurolens enhances memory recall, object discovery, and real-world navigation using AI. Stay independent and in control with real-time context tracking and smart assistance.
                </p>
                <div className="mt-6 flex justify-center space-x-4 mt-10">
                    <HoverBorderGradientDemo/>
                </div>
            </motion.div>

        </div>
    )
}

export default Home