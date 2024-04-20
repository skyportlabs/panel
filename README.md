# Skyport Panel

## Overview
- Simple, funnier version: An open source project powered by Docker for managing applications, game servers and more. Ditch Pterodactyl or PufferPanel and fly higher with a panel that isn't named after a creature.
- Advanced version: Skyport Panel is a web-based application that serves as a management interface for server instances and resources. Built on Express, it leverages modern web technologies to provide a user-friendly interface for server management tasks.

## Features
- **Real-Time Communication:** Uses WebSockets for live updates on console outputs and server usage / resource stats, enhancing the user interaction with real-time data.
- **Admin Area:** Dedicated admin controls for managing application settings, user roles, and more, accessible only to users with admin privileges.
- **Nodes System:** Manage and monitor multiple nodes, allowing you to use multiple machines and split instances across them.
- **Users System:** A comprehensive user management system that allows for creating, modifying, and deleting user profiles and roles.
- **Images Management:** You can manage Docker images, allowing them to deploy, update, or remove images as needed.
- **Interactive UI:** A modern and responsive user interface that simplifies complex tasks and enhances user experience.


## Installation
1. Clone the repository:
`git clone https://github.com/skyportlabs/panel/`

2. Install dependencies:
`npm install`

3. Seed images and create a user:
```
npm run seed
npm run createUser
```

4. Start the Panel:
`node . # or use pm2 to keep it online`

## Configuration
Edit the `config.json` file in the root directory to set up the application settings including the database connection and port.

## Usage
Navigate to `http://localhost:<port>` to access the Skyport Panel. Log in with your user credentials to manage and view instances.

## Contributing
Contributions are welcome. Please fork the repository and submit pull requests with your proposed changes.

## License
(c) 2024 Matt James and contributors. All rights reserved. Licensed under the MIT License.