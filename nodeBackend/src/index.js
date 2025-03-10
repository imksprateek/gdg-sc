import cors from "cors"
import dotenv from "dotenv"
import express from "express"
import helmet from "helmet"
import morgan from "morgan"
import contextRoutes from "./routes/context.route.js"

dotenv.config();


export const app = express();


app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.disable("x-powered-by"); // hide express server information
app.use(express.json());


app.use('/api/context', contextRoutes);
// app.use('/api/speech', speechRoutes);
// app.use('/api/care', careRoutes);




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`App running on port ${PORT}`);
})
