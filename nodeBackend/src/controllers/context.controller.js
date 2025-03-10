import axios from "axios"
import FormData from "form-data"
export const forwardImageToFlask = async (req, res) => {
    try {
        console.log("Inside");
        const uid = req.user.uid;
        if (!req.file) {
            return res.status(404).json({ message: "No image uploaded" });
        }
        const formData = new FormData();
        formData.append("image", req.file.buffer, {
            filename: req.file.originalname, 
            contentType: req.file.mimetype
        });
        formData.append("userId", uid)

        const flaskResponse = await axios.post(
            "http://127.0.0.1:5000/describe-image",
            formData,
            {
                headers: formData.getHeaders()
            }
        );
        res.status(200).json(flaskResponse.data);
    } catch (error) {
        res.status(500).json({ message: "Internal server error while forwading images to flask" });
    }
}

export const forwardQueryToFlask = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ message: "Query is requied" });
        }

        const flaskResponse = await axios.post("http://127.0.0.1:5000/query", {
            userId: uid,
            query,
        })

        res.status(200).json(flaskResponse.data);

    } catch (error) {
        res.status(500).json({ error: "Internal server error while forwarding query to Flask" });
    }
}

export const clearContext = async (req, res) => {
    try {
        const uid = req.user.uid;

        const flaskResponse = await axios.post(
            "http://127.0.0.1:5000/clear-context", {
            userId: uid,
        }
        );
        res.status(200).json(flaskResponse.data);
    } catch (error) {
        console.error("Error clearing context:", error);
        res.status(500).json({ error: "Internal server error while clearing context" });
    }
}