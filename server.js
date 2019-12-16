const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const uuid = require("uuid/v4");
var db; // Global collection

const MongoClient = require("mongodb").MongoClient;
MongoClient.connect(process.env.MONGO_URI, (res, database) => {
  db = database.db("exercise-db");
  const listener = app.listen(process.env.PORT || 3000, () => {
    console.log("Your app is listening on port " + listener.address().port);
  });
});

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));

// Load Root Page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

//Add new user post request handler
app.post("/api/exercise/new-user?:newuser", (req, res) => {
  const username = req.body.username;
  const newuser = { _id: uuid().slice(-5), username: username };
  //Add new user to database
  if (username.match(/\w+/gi)) {
    db.collection("users")
      .save(newuser)
      .then(response => {
        res.send(`Added ${newuser.username} to collection.`);
      });
  } else {
    res.send("Please enter a valid username.");
  }
});

//Add new exercise handler
app.post("/api/exercise/add", (req, res) => {
  const usersDb = db.collection("users");
  const activities = db.collection("activities");
  //Extract field input from form
  const { userid, description, duration, date } = req.body;
  let exists = false;

  // Create activity from form data
  const activity = {
    description: description,
    duration: duration,
    date: new Date(date).toISOString()
  };

  // Check if user exists in user list
  db.collection("users")
    .findOne({ _id: userid })
    .then(response => {
      if (response) {
        exists = true;
      }
    });

  //Check if user and exercise list exists, if not, create new
  activities.findOne({ _id: userid }).then(response => {
    if (response && exists) {
      // Update activities array
      activities.update(
        { _id: userid },
        { $addToSet: { activities: activity } },
        (err, res) => {
          console.log(
            res ? `Updated list of activities for ${userid}` : "db error"
          );
        }
      );
      res.send(`Updated ${userid}`);
    } else if (!res && exists) {
      // Create new activity
      activities.save(activity, (err, res) => {
        console.log("Created new activity");
      });
      res.send(`Created new activity for ${userid}`);
    } else {
      res.send("User does not Exist...");
    }
  });
});

// Route lists exercises by userid
// e.g. /api/exercise/log?userId=18e9d&from=2019-04-01&to=2019-09-01
app.get("/api/exercise/log?:userId/:from?/:to?/:limit?", (req, res) => {
  const activities = db.collection("activities");
  const { userId, limit, from, to } = req.query;
  console.log("query:", req.query);

  // Range Filter
  let filter = {
    input: "$activities",
    as: "list",
    cond: {
      $and: [{ $gte: ["$$list.date", from] }, { $lte: ["$$list.date", to] }]
    }
  };

  // If Limit and Range
  if (limit && from && to) {
    console.log(`Range: ${from} - ${to} Limit:${limit}`);
    activities
      .aggregate([
        { $match: { _id: userId } },
        {
          $project: {
            activities: {
              $slice: [{ $filter: filter }, parseInt(limit)]
            }
          }
        }
      ])
      .toArray()
      .then(response => {
        res.send(response);
      });
  }

  //If Range Only
  else if (!limit && from && to) {
    console.log(`Range: ${from} - ${to}`);
    activities
      .aggregate([
        { $match: { _id: userId } },
        {
          $project: {
            activities: {
              $filter: filter
            }
          }
        }
      ])
      .toArray()
      .then(response => {
        res.send(response);
      });
  } else if (limit && !from && !to) {
    //If limit Only
    console.log(`Limit only: ${limit}`);
    activities
      .findOne({ _id: userId }, { activities: { $slice: parseInt(limit) } })
      .then(response => {
        res.send(response);
      });
  }
});

// Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: "Page Not Found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});
