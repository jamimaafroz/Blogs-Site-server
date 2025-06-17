const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-adminsdk-accessKey.json");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.on3ghb8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFireBaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("Decoded Token", decoded);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

async function run() {
  try {
    await client.connect();
    const blogCollection = client.db("BlogDB").collection("Blogs");
    const commentCollection = client.db("BlogDB").collection("comments");
    const wishlistCollection = client.db("BlogDB").collection("wishlist");

    // Protected: Get all blogs
    app.get("/allBlogs", async (req, res) => {
      const result = await blogCollection.find().toArray();
      res.send(result);
    });

    // Protected: Get a single blog by ID
    app.get("/allBlogs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogCollection.findOne(query);
      res.send(result);
    });

    // Protected: Add a new blog
    app.post("/blog", verifyFireBaseToken, async (req, res) => {
      const newBlog = req.body;
      const result = await blogCollection.insertOne(newBlog);
      res.send(result);
    });

    // Protected: Update a blog
    app.put("/blogs/:id", verifyFireBaseToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateBlog = req.body;

      const updatedDoc = {
        $set: updateBlog,
      };

      const result = await blogCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // Get comments by blog ID (public)
    app.get("/comments/:blogId", async (req, res) => {
      const { blogId } = req.params;
      try {
        const comments = await commentCollection
          .find({ blogId: new ObjectId(blogId) })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(comments);
      } catch (error) {
        res.status(500).send({ message: "Error fetching comments", error });
      }
    });

    // Protected: Add to wishlist
    app.post("/wishlist", verifyFireBaseToken, async (req, res) => {
      try {
        const item = req.body;

        const existing = await wishlistCollection.findOne({
          blogId: item.blogId,
          userEmail: item.userEmail,
        });

        if (existing) {
          return res
            .status(400)
            .send({ acknowledged: false, message: "Already in wishlist" });
        }

        const result = await wishlistCollection.insertOne(item);
        if (result.acknowledged) {
          return res.send({
            acknowledged: true,
            item: { ...item, _id: result.insertedId },
          });
        } else {
          res
            .status(500)
            .send({ acknowledged: false, message: "Insert failed" });
        }
      } catch (error) {
        console.error("Add wishlist error:", error);
        res.status(500).send({ acknowledged: false, message: "Server error" });
      }
    });

    // Protected: Get wishlist by user email
    app.get("/wishlist/:email", verifyFireBaseToken, async (req, res) => {
      try {
        const email = req.params.email;
        const wishlistItems = await wishlistCollection
          .find({ userEmail: email })
          .toArray();
        res.send(wishlistItems);
      } catch (error) {
        console.error("Get wishlist error:", error);
        res.status(500).send({ message: "Failed to get wishlist" });
      }
    });

    // Protected: Remove from wishlist by wishlist document _id
    app.delete("/wishlist/:id", verifyFireBaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Delete wishlist error:", error);
        res.status(500).send({ message: "Failed to delete wishlist item" });
      }
    });

    // Add a new comment (public)
    app.post("/comments", async (req, res) => {
      const { blogId, username, userPhoto, email, comment } = req.body;
      if (!blogId || !username || !comment) {
        return res.status(400).send({ message: "Missing required fields" });
      }
      try {
        const newComment = {
          blogId: new ObjectId(blogId),
          username,
          userPhoto,
          email,
          comment,
          createdAt: new Date(),
        };
        const result = await commentCollection.insertOne(newComment);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error saving comment", error });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("✅ Connected to MongoDB");
  } finally {
    // Keep the connection open while server runs
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running on Port!!");
});

app.listen(port, () => {
  console.log(`Blogs server is running on port ${port}`);
});
