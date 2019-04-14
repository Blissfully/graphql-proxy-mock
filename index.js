const express = require("express");
const bodyParser = require("body-parser");
const hash = require("object-hash");
const { setContext } = require("apollo-link-context");
const interceptor = require("express-interceptor");
const { ApolloServer, gql } = require("apollo-server-express");
const fs = require('fs-extra')

String.prototype.hashCode = function() {
  var hash = 0,
    i,
    chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr = this.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const {
  makeRemoteExecutableSchema,
  introspectSchema,
  mergeSchemas
} = require("graphql-tools");

const { HttpLink } = require("apollo-link-http");
const fetch = require("node-fetch");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const graphQLSchemaUrl =
  process.argv[2] || "https://api.blissfully.com/prod/graphql";

console.log(`Proxying: ${graphQLSchemaUrl}`);

async function main() {
  const http = new HttpLink({ uri: graphQLSchemaUrl, fetch });

  const link = setContext((request, previousContext) => {
    console.log("REQU")
    console.log({previousContext, request})
    if(request.headers ) {
      console.log("YOOOOO", headers)

    }

    if(!previousContext.graphqlContext || !previousContext.graphqlContext.headers) {
      return {}
    }

    return {
      headers: {
        authorization: `${previousContext.graphqlContext.headers.authorization}`
      }
    };
  }).concat(http);

  const remoteSchema = await introspectSchema(link);
  const schema = await makeRemoteExecutableSchema({
    schema: remoteSchema,
    link: link
  });

  // In the most basic sense, the ApolloServer can be started
  // by passing type definitions (typeDefs) and the resolvers
  // responsible for fetching the data for those types.
  const server = new ApolloServer({ schema, context: ({req}) => ({headers: req ? req.headers : null}) });

  const app = express();

  // parse application/json
  app.use(bodyParser.json());

  const objReplaceByHash = {};

  app.use(function(req, res, next) {
    console.log(req.headers);

    if (!req.body) {
      console.log("No body");
      return next();
    }

    if (req.method != "GET") {
      console.log("Not a GET");
      return next();
    }

    if (req.body.query) {
      req.queryHash = req.body.query.hashCode();
    } else if (req.query.query) {
      req.queryHash = req.query.query.hashCode();
    }

    if (req.queryHash) {
      console.log("hashes as ", req.queryHash);

      const requestFolder = `cache/${req.queryHash}`
      if (fs.existsSync(requestFolder)) {
        const responseFile = `${requestFolder}/responses/default.json`
        const cacheValue = fs.readFileSync(responseFile, 'utf8')
        console.log("Returning from hash cache");
        console.log(cacheValue);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(200).send(cacheValue).send;
      }
    }

    //default
    return next();
  });

  app.set("etag", false);

  // Add the interceptor middleware
  app.use(
    interceptor(function(req, res) {
      return {
        // Only HTML responses will be intercepted
        isInterceptable: function() {
          console.log(res.get("Content-Type"));
          return /application\/json/.test(res.get("Content-Type"));
        },
        // Appends a paragraph at the end of the response body
        intercept: function(body, send) {
          console.log("Intercepting response & caching");
          console.log({body})

          const queryFolder = `cache/${req.queryHash}`
          const responseFilename = `${queryFolder}/responses/default.json`
          const requestFilename = `${queryFolder}/request.json`
          fs.outputFile(responseFilename, body, (err) => {
            if(err) {
              console.log({err})
            }
            console.log(`Wrote: ${responseFilename}`)
          })
          fs.outputJson(requestFilename, {query:req.query, body:req.body}, (err) => {
            if(err) {
              console.log({err})
            }
            console.log(`Wrote: ${requestFilename}`)
          })

          // objReplaceByHash[req.queryHash] = body;
          send(body);
        }
      };
    })
  );

  server.applyMiddleware({
    app: app
  });

  app.listen({ port: 4000 }, () => {
    console.log(
      `🚀  Server ready at http://localhost:4000${server.graphqlPath}`
    );
  });
}

(async () => {
  var text = await main();
  console.log(text);
})().catch(e => {
  // Deal with the fact the chain failed
  console.log(e);
});
