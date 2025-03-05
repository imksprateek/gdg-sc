import { createBrowserRouter } from "react-router-dom"
import App from "../App"
import Home from "../scenes/Home/Home"
import About from "../scenes/About"

const Router = createBrowserRouter([
    {
        path:"/",
        element:<App/>,
        children:[
            {
                path:'/',
                element:<Home/>
            },
            {
                path:"/about",
                element:<About/>
            }
        ]
    }
])

export default Router