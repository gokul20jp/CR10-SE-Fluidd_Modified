sshpass -p 'Creality2023' rsync -azz --delete --exclude='*.bak*' --exclude='*.git*' dist/ "root@192.168.1.100:/usr/data/fluidd/"
sshpass -p 'Creality2023' ssh root@192.168.1.100 "chmod -R 755 /usr/data/fluidd/"
