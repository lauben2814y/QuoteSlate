const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const app = express();

// Trust the proxy to get the real client IP
app.set("trust proxy", 1);

// Enable CORS for all routes
app.use(cors());

// Add IP logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Request from IP: ${req.ip}`);
  next();
});

// Load quotes data
const quotesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/quotes.json"), "utf8"),
);

// Helper function to normalize author names
function normalizeAuthorName(author) {
  return decodeURIComponent(author).trim().toLowerCase();
}

// Helper function to check if a quote's author matches any of the requested authors
function hasMatchingAuthor(quote, requestedAuthors) {
  if (!requestedAuthors) return true;
  const quoteAuthor = normalizeAuthorName(quote.author);
  return requestedAuthors.some(
    (author) => normalizeAuthorName(author) === quoteAuthor,
  );
}

// Helper function to check if a quote's author contains the partial search terms
function hasPartialAuthorMatch(quote, searchTerms) {
  if (!searchTerms || searchTerms.length === 0) return true;
  
  const quoteAuthor = normalizeAuthorName(quote.author);
  
  // Check if all search terms are found in the author name
  return searchTerms.every(term => 
    quoteAuthor.includes(normalizeAuthorName(term))
  );
}

// Helper function to check if a quote matches all requested tags
function hasMatchingTags(quote, requestedTags) {
  if (!requestedTags) return true;
  const quoteTags = new Set(quote.tags);
  return requestedTags.every((tag) => quoteTags.has(tag));
}

// Helper function to check if a quote matches partial tag search terms
function hasPartialTagMatch(quote, tagTerms) {
  if (!tagTerms || tagTerms.length === 0) return true;
  
  // Convert quote tags to lowercase for case-insensitive matching
  const quoteTags = quote.tags.map(tag => tag.toLowerCase());
  
  // Check if there's at least one tag that contains each search term
  return tagTerms.every(term => {
    const normalizedTerm = term.toLowerCase();
    return quoteTags.some(tag => tag.includes(normalizedTerm));
  });
}

// Main quote retrieval function
function getQuotes({
  maxLength = null,
  minLength = null,
  tags = null,
  count = 1,
  authors = null,
} = {}) {
  let validQuotes = [...quotesData];

  // Filter by authors if provided
  if (authors) {
    validQuotes = validQuotes.filter((quote) =>
      hasMatchingAuthor(quote, authors),
    );
  }

  // Filter by tags if provided
  if (tags) {
    validQuotes = validQuotes.filter((quote) => hasMatchingTags(quote, tags));
  }

  // If no quotes match the criteria, return null
  if (validQuotes.length === 0) {
    return null;
  }

  // Apply length filters
  if (minLength !== null) {
    validQuotes = validQuotes.filter((quote) => quote.length >= minLength);
  }

  if (maxLength !== null) {
    validQuotes = validQuotes.filter((quote) => quote.length <= maxLength);
  }

  if (validQuotes.length === 0) {
    return null;
  }

  // If requesting more quotes than available, return all available quotes
  count = Math.min(count, validQuotes.length);

  // Get random quotes
  const quotes = [];
  const tempQuotes = [...validQuotes];

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * tempQuotes.length);
    quotes.push(tempQuotes[randomIndex]);
    tempQuotes.splice(randomIndex, 1);
  }

  return quotes;
}

// Function for searching quotes with partial matching
function searchQuotes({
  maxLength = null,
  minLength = null,
  tagTerms = [],
  limit = 10,
  authorTerms = [],
} = {}) {
  let validQuotes = [...quotesData];

  // Filter by partial author name matches if provided
  if (authorTerms && authorTerms.length > 0) {
    validQuotes = validQuotes.filter((quote) =>
      hasPartialAuthorMatch(quote, authorTerms),
    );
  }

  // Filter by partial tag matches if provided
  if (tagTerms && tagTerms.length > 0) {
    validQuotes = validQuotes.filter((quote) => 
      hasPartialTagMatch(quote, tagTerms)
    );
  }

  // If no quotes match the criteria, return null
  if (validQuotes.length === 0) {
    return null;
  }

  // Apply length filters
  if (minLength !== null) {
    validQuotes = validQuotes.filter((quote) => quote.length >= minLength);
  }

  if (maxLength !== null) {
    validQuotes = validQuotes.filter((quote) => quote.length <= maxLength);
  }

  if (validQuotes.length === 0) {
    return null;
  }

  // If requesting more quotes than available, return all available quotes
  limit = Math.min(limit, validQuotes.length);

  // Get random quotes
  const quotes = [];
  const tempQuotes = [...validQuotes];

  for (let i = 0; i < limit; i++) {
    const randomIndex = Math.floor(Math.random() * tempQuotes.length);
    quotes.push(tempQuotes[randomIndex]);
    tempQuotes.splice(randomIndex, 1);
  }

  return quotes;
}

// Get list of all available authors with their quote counts
app.get("/api/authors", (req, res) => {
  try {
    const authorsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/authors.json"), "utf8"),
    );
    res.json(authorsData);
  } catch (error) {
    res.status(500).json({
      error: "Error fetching authors list",
    });
  }
});

// Get list of all available tags
app.get("/api/tags", (req, res) => {
  try {
    const tags = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/tags.json"), "utf8"),
    );
    res.json(tags);
  } catch (error) {
    res.status(500).json({
      error: "Error fetching tags list",
    });
  }
});

// Main quote endpoint (returns single quote or array based on count)
app.get("/api/quotes/random", (req, res) => {
  const maxLength = req.query.maxLength ? parseInt(req.query.maxLength) : null;
  const minLength = req.query.minLength ? parseInt(req.query.minLength) : null;
  const tags = req.query.tags
    ? req.query.tags.split(",").map((tag) => tag.toLowerCase())
    : null;
  const authors = req.query.authors ? req.query.authors.split(",") : null;
  const count = req.query.count ? parseInt(req.query.count) : 1;

  // Validate count parameter
  if (isNaN(count) || count < 1 || count > 50) {
    return res.status(400).json({
      error: "Count must be a number between 1 and 50.",
    });
  }

  // Validate authors only if authors parameter is provided
  if (authors) {
    try {
      const authorsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../data/authors.json"), "utf8"),
      );

      // Create a map of lowercase author names to their proper case versions
      const authorMap = {};
      Object.keys(authorsData).forEach((author) => {
        authorMap[author.toLowerCase()] = author;
      });

      // Check for invalid authors and convert to proper case
      const processedAuthors = [];
      const invalidAuthors = [];

      authors.forEach((author) => {
        const lowercaseAuthor = author.toLowerCase();
        if (authorMap[lowercaseAuthor]) {
          processedAuthors.push(authorMap[lowercaseAuthor]);
        } else {
          invalidAuthors.push(author);
        }
      });

      if (invalidAuthors.length > 0) {
        return res.status(400).json({
          error: `Invalid author(s): ${invalidAuthors.join(", ")}`,
        });
      }

      // Replace the authors array with the properly cased versions
      authors.splice(0, authors.length, ...processedAuthors);
    } catch (error) {
      return res.status(500).json({
        error: "Error validating authors",
      });
    }
  }

  // Validate tags only if tags parameter is provided
  if (tags) {
    try {
      const validTags = new Set(
        JSON.parse(
          fs.readFileSync(path.join(__dirname, "../data/tags.json"), "utf8"),
        ),
      );
      const invalidTags = tags.filter((tag) => !validTags.has(tag));
      if (invalidTags.length > 0) {
        return res.status(400).json({
          error: `Invalid tag(s): ${invalidTags.join(", ")}`,
        });
      }
    } catch (error) {
      return res.status(500).json({
        error: "Error validating tags",
      });
    }
  }

  // Validate length parameters if both are provided
  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    return res.status(400).json({
      error: "minLength must be less than or equal to maxLength.",
    });
  }

  const quotes = getQuotes({ maxLength, minLength, tags, count, authors });

  if (quotes) {
    res.json(count === 1 ? quotes[0] : quotes);
  } else {
    res.status(404).json({ error: "No quotes found matching the criteria." });
  }
});

// MODIFIED: Quotes list endpoint with partial tag matching support
app.get("/api/quotes/list", (req, res) => {
  const maxLength = req.query.maxLength ? parseInt(req.query.maxLength) : null;
  const minLength = req.query.minLength ? parseInt(req.query.minLength) : null;
  
  // Check if we should use exact tag matching or partial tag matching
  const exactTags = req.query.exactTags === "true";
  
  const tags = req.query.tags 
    ? req.query.tags.split(",").map(tag => tag.toLowerCase())
    : null;
  
  const tagTerms = !exactTags && req.query.tags 
    ? req.query.tags.split(",")
    : [];
  
  const authors = req.query.authors ? req.query.authors.split(",") : null;
  const limit = req.query.limit ? parseInt(req.query.limit) : 10; // Default to 10 quotes

  // Validate limit parameter
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: "Limit must be a number between 1 and 100.",
    });
  }

  // Validate authors only if authors parameter is provided
  if (authors) {
    try {
      const authorsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../data/authors.json"), "utf8"),
      );

      // Create a map of lowercase author names to their proper case versions
      const authorMap = {};
      Object.keys(authorsData).forEach((author) => {
        authorMap[author.toLowerCase()] = author;
      });

      // Check for invalid authors and convert to proper case
      const processedAuthors = [];
      const invalidAuthors = [];

      authors.forEach((author) => {
        const lowercaseAuthor = author.toLowerCase();
        if (authorMap[lowercaseAuthor]) {
          processedAuthors.push(authorMap[lowercaseAuthor]);
        } else {
          invalidAuthors.push(author);
        }
      });

      if (invalidAuthors.length > 0) {
        return res.status(400).json({
          error: `Invalid author(s): ${invalidAuthors.join(", ")}`,
        });
      }

      // Replace the authors array with the properly cased versions
      authors.splice(0, authors.length, ...processedAuthors);
    } catch (error) {
      return res.status(500).json({
        error: "Error validating authors",
      });
    }
  }

  // Validate tags only if exact tags are required and tags parameter is provided
  if (exactTags && tags) {
    try {
      const validTags = new Set(
        JSON.parse(
          fs.readFileSync(path.join(__dirname, "../data/tags.json"), "utf8"),
        ),
      );
      const invalidTags = tags.filter((tag) => !validTags.has(tag));
      if (invalidTags.length > 0) {
        return res.status(400).json({
          error: `Invalid tag(s): ${invalidTags.join(", ")}`,
        });
      }
    } catch (error) {
      return res.status(500).json({
        error: "Error validating tags",
      });
    }
  }

  // Validate length parameters if both are provided
  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    return res.status(400).json({
      error: "minLength must be less than or equal to maxLength.",
    });
  }

  let quotes;
  
  if (exactTags) {
    // Use the original getQuotes function for exact tag matching
    quotes = getQuotes({ maxLength, minLength, tags, count: limit, authors });
  } else {
    // Use the new searchQuotes function for partial tag matching
    quotes = searchQuotes({ 
      maxLength, 
      minLength, 
      tagTerms, 
      limit, 
      authorTerms: [] // No author search in this case
    });
  }

  if (quotes) {
    res.json(quotes); // Always return an array
  } else {
    res.status(404).json({ error: "No quotes found matching the criteria." });
  }
});

// Search quotes by partial author names (always returns an array)
app.get("/api/quotes/author-search", (req, res) => {
  const maxLength = req.query.maxLength ? parseInt(req.query.maxLength) : null;
  const minLength = req.query.minLength ? parseInt(req.query.minLength) : null;
  const tagTerms = req.query.tags ? req.query.tags.split(",") : [];
  const authorTerms = req.query.terms ? req.query.terms.split(",") : [];
  const limit = req.query.limit ? parseInt(req.query.limit) : 10; // Default to 10 quotes

  // Validate limit parameter
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: "Limit must be a number between 1 and 100.",
    });
  }

  // Validate length parameters if both are provided
  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    return res.status(400).json({
      error: "minLength must be less than or equal to maxLength.",
    });
  }

  // Get matching quotes using partial search
  const quotes = searchQuotes({ 
    maxLength, 
    minLength, 
    tagTerms, 
    limit, 
    authorTerms 
  });

  if (quotes) {
    res.json(quotes); // Always return an array
  } else {
    res.status(404).json({ error: "No quotes found matching the criteria." });
  }
});

// NEW ENDPOINT: Combined search with partial tag and author matching
app.get("/api/quotes/search", (req, res) => {
  const maxLength = req.query.maxLength ? parseInt(req.query.maxLength) : null;
  const minLength = req.query.minLength ? parseInt(req.query.minLength) : null;
  const tagTerms = req.query.tags ? req.query.tags.split(",") : [];
  const authorTerms = req.query.authors ? req.query.authors.split(",") : [];
  const limit = req.query.limit ? parseInt(req.query.limit) : 10; // Default to 10 quotes

  // Validate limit parameter
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: "Limit must be a number between 1 and 100.",
    });
  }

  // Validate length parameters if both are provided
  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    return res.status(400).json({
      error: "minLength must be less than or equal to maxLength.",
    });
  }

  // Get matching quotes using partial search for both tags and authors
  const quotes = searchQuotes({ 
    maxLength, 
    minLength, 
    tagTerms, 
    limit, 
    authorTerms 
  });

  if (quotes) {
    res.json(quotes); // Always return an array
  } else {
    res.status(404).json({ error: "No quotes found matching the criteria." });
  }
});

// Home page route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

module.exports = app;