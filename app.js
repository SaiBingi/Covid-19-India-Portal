const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let database = null;

const initializeDatabaseAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDatabaseAndServer();

// Login User API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT 
        *
    FROM
        user
    WHERE
        username = '${username}';
  `;
  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      response.send({ jwtToken });
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];

  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const convertDatabaseObjectToResponseObject = (databaseObject) => {
  return {
    stateId: databaseObject.state_id,
    stateName: databaseObject.state_name,
    population: databaseObject.population,
  };
};

// GET all states in the state table

app.get("/states/", authenticateToken, async (request, response) => {
  const selectStatesQuery = `
        SELECT
            *
        FROM
            state;
    `;
  const allStates = await database.all(selectStatesQuery);
  response.send(
    allStates.map((eachState) =>
      convertDatabaseObjectToResponseObject(eachState)
    )
  );
});

// GET a state based on state_id

app.get("/states/:stateId", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const selectStateQuery = `
    SELECT 
        *
    FROM
        state
    WHERE
        state_id = ${stateId};
  `;
  const dbState = await database.get(selectStateQuery);
  response.send({
    stateId: dbState.state_id,
    stateName: dbState.state_name,
    population: dbState.population,
  });
});

// Create a district in the district table

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
    INSERT INTO district(
        district_name, 
        state_id, 
        cases, 
        cured, 
        active, 
        deaths
    )
    VALUES(
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );
  `;
  await database.run(createDistrictQuery);
  response.send("District Successfully Added");
});

// GET a district details based on district_id

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const selectDistrictQuery = `
        SELECT
            *
        FROM 
            district
        WHERE
            district_id = ${districtId};
    `;
    const dbDistrict = await database.get(selectDistrictQuery);
    response.send({
      districtId: dbDistrict.district_id,
      districtName: dbDistrict.district_name,
      stateId: dbDistrict.state_id,
      cases: dbDistrict.cases,
      cured: dbDistrict.cured,
      active: dbDistrict.active,
      deaths: dbDistrict.deaths,
    });
  }
);

// DELETE a district from the district table based on the district_id

app.delete(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
        DELETE FROM district
        WHERE
            district_id = ${districtId};
    `;
    await database.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

// UPDATE district details based on district_id

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const updateDistrictQuery = `
        UPDATE district
        SET
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
        WHERE
            district_id = ${districtId};    
    `;
    await database.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

// GET the statistics of total cases, cured, active, deaths of a specific state based on state ID

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const selectStatsQuery = `
        SELECT 
            SUM(cases),
            SUM(cured),
            SUM(active),
            SUM(deaths)
        FROM
            state NATURAL JOIN district
        WHERE
            state_id = ${stateId};    
    `;
    const dbStats = await database.get(selectStatsQuery);
    response.send({
      totalCases: dbStats["SUM(cases)"],
      totalCured: dbStats["SUM(cured)"],
      totalActive: dbStats["SUM(active)"],
      totalDeaths: dbStats["SUM(deaths)"],
    });
  }
);

module.exports = app;
