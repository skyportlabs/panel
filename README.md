![\[!image\](https://i.imgur.com/SU7QypZ.png)](https://i.imgur.com/SU7QypZ.png)

![Discord](https://img.shields.io/discord/1253782902618194011?label=Discord&logo=Discord&logoColor=white&style=for-the-badge)
![GitHub Releases](https://img.shields.io/github/downloads/skyportlabs/panel/latest/total?style=for-the-badge)
![GitHub contributors](https://img.shields.io/github/contributors/skyportlabs/panel?style=for-the-badge)

# Skyport Panel

## Overview
Skyport is an open source panel for managing and operating game servers and applications built using Node.js with Express and Dockerode. [Click here to join our Discord.](https://discord.gg/skyport)

> [!WARNING]
> Skyport is not ready for production use, nor does it have a stable and completed release yet.

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
