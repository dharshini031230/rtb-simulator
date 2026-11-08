AdTech Playground: RTB Auction Simulator

An interactive Real-Time Bidding (RTB) auction simulator built with JavaScript.

AdTech Playground is an educational project that demonstrates how programmatic advertising auctions work. Users can configure advertisers, submit bids, run a simulated auction and explore how a winning bid is selected.

The project aims to make fundamental ad-tech concepts easier to understand through a working application rather than theory alone.

Live Demo: "View the RTB Auction Simulator" (ADD_YOUR_DEPLOYED_URL)

Project Overview

In programmatic advertising, Real-Time Bidding allows advertisers to compete for individual advertising impressions through automated auctions.

This simulator recreates a simplified version of that process using a first-price auction model.

Users can experiment with different advertiser bids and observe how the auction engine validates bids, ranks competitors, resolves ties and determines the winner.

All data is simulated. The application does not connect to real advertising exchanges or advertising platforms.

Features

- Advertiser Management: Add, edit and remove advertisers.
- Bid Configuration: Set individual CPM bids and experiment with different values.
- Auction Simulation: Run a first-price auction and identify the winning advertiser.
- Bid Validation: Detect invalid inputs and explain why a bid was rejected.
- Bid Ranking: Display competing bids in descending order.
- Tie-breaking: Resolve equal highest bids using submission order.
- No-fill Handling: Show what happens when no valid bids are available.
- Auction Timeline: Explore the stages of a simplified RTB auction.
- Bid Request Preview: Generate an OpenRTB-inspired JSON bid request and inspect its fields.
- Responsive Interface: Use the simulator on desktop and mobile devices.

How It Works

The simulator follows a simplified RTB auction workflow.

1. An advertising impression becomes available.
2. A bid request describes the available advertising opportunity.
3. Advertisers submit their CPM bids.
4. The auction engine validates and ranks the bids.
5. The highest valid bidder wins.
6. The winner pays the amount they bid.

The project uses a first-price auction model, meaning the winning advertiser pays their own submitted bid.

For example, if three advertisers submit bids of $2.50, $3.20 and $2.80 CPM, the advertiser bidding $3.20 wins and pays $3.20 CPM.

Technology Stack

Technology| Purpose
HTML| Application structure
CSS| Styling and responsive layout
JavaScript| Auction logic and application interactions
Node.js Test Runner| Automated testing

The application uses vanilla JavaScript without a frontend framework or external runtime dependencies.

Project Structure

The application separates auction calculations from interface interactions.

"auction-core.js" contains the core auction logic, including bid validation, ranking, tie-breaking and winner selection.

"app.js" manages the user interface, application state and interactions.

"index.html" defines the application structure, while "styles.css" handles the visual presentation.

Understanding the Auction Logic

The auction engine handles several important operations:

Bid validation: Checks advertiser names and bid values before accepting submissions.

Bid ranking: Sorts valid bids from highest to lowest.

Tie-breaking: Uses advertiser submission order when multiple advertisers submit the same highest bid.

Winner selection: Selects the highest valid bid.

Auction pricing: Uses the first-price model, where the winner pays their submitted bid.

Currency precision: Converts monetary values into integer cents to avoid common floating-point calculation errors.

OpenRTB-Inspired Bid Request

The simulator generates an illustrative JSON bid request based on concepts from the OpenRTB specification.

The request includes information about the impression, banner dimensions, bid floor, currency, website and device.

This feature demonstrates how structured JSON communicates advertising opportunities between components of a programmatic advertising ecosystem.

The generated request is for demonstration purposes only. It is not transmitted to an external advertising platform or certified as a complete OpenRTB implementation.


Running the Project

The application can be opened directly in a browser.

Alternatively, run a local development server:

npx --yes serve .

Running Automated Tests

The project includes 30 automated tests using Node.js's built-in test runner.

Run the tests with:

npm test

Or:

node --test

The tests cover auction calculations, bid validation, winner selection, tie-breaking, no-fill scenarios and bid request generation.

Project Scope and Limitations

This project is a simplified educational simulation, not a production RTB platform.

It currently supports a single advertising impression and a first-price auction model. Advertiser bids are manually configured, and the auction runs locally in the browser.

It does not connect to real DSPs, SSPs or ad exchanges, and it does not process live advertising traffic.

Future Improvements

Potential extensions include:

- Building a REST API around the auction engine.
- Supporting second-price auction simulations.
- Introducing configurable bid floors.
- Comparing different auction mechanisms.
- Adding analytics across multiple auction runs.
- Exploring bid shading and auction timeouts.



 
