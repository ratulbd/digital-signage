@echo off
REM Remove port forwards and firewall rules created by setup-windows-port-forward.bat

echo Removing port proxies...
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=3002 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=9000 listenaddress=0.0.0.0

echo Removing firewall rules...
netsh advfirewall firewall delete rule name="DigitalSignage-3000"
netsh advfirewall firewall delete rule name="DigitalSignage-3001"
netsh advfirewall firewall delete rule name="DigitalSignage-3002"
netsh advfirewall firewall delete rule name="DigitalSignage-9000"

echo Done!
netsh interface portproxy show all
pause
