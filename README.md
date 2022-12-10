# ABC (Altspace Billiards Community edition)
## How to host your own ABC MRE
- Step 1: Build  
`docker build -t <name> .`
- Step 2: Config  
`cp .env_template .env`  
modify the content of `.env`
- Step 3: Run  
`docker run -d -it --restart=always --env-file .env -p 3901:3901 <name>`

## License
- The ABC MRE is released under the GPLv3 License

## Credits
- 3D model by https://github.com/VRCBilliards/vrcbce
- MRE by [the Free MRE Foundation](https://github.com/the-Free-MRE-Foundation)  

## Join us
[![Discord](https://img.shields.io/badge/Discord-%237289DA.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/yStWGYcgKJ)
