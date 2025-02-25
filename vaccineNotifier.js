require('dotenv').config()
const moment = require('moment');
const cron = require('node-cron');
// const axios = require('axios');
const notifier = require('./notifier');
const fetch = require('node-fetch');
/**
Step 1) Enable application access on your gmail with steps given here:
 https://support.google.com/accounts/answer/185833?p=InvalidSecondFactor&visit_id=637554658548216477-2576856839&rd=1

Step 2) Enter the details in the file .env, present in the same folder

Step 3) On your terminal run: npm i && pm2 start vaccineNotifier.js

To close the app, run: pm2 stop vaccineNotifier.js && pm2 delete vaccineNotifier.js
 */

const PINCODE = process.env.PINCODE
const EMAIL = process.env.EMAIL
const AGE = process.env.AGE
const SLACK_HOOK = process.env.SLACK_HOOK
const districtName = {
  265: "Bangalore Urban",
  305: "Kozhikode"        
}


async function main(){
    try {
        cron.schedule('* * * * *', async () => {
             console.log("checking vaccine availability!")
             await checkAvailability();
        });

    } catch (e) {
        console.log('an error occured: ' + JSON.stringify(e, null, 2));
        throw e;
    }
}

async function checkAvailability() {

    let datesArray = await fetchNext2weeks();
    console.log(datesArray)
    datesArray.forEach(date => {
        [265, 305].forEach(districtId => {
            getSlotsForDate(date, districtId);
        })    
    })
    
}

function getSlotsForDate(DATE, districtId) {
    // let config = {
    //     method: 'get',
    //     url: 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByPin?pincode=' + PINCODE + '&date=' + DATE,
    //     headers: {
    //         'accept': 'application/json',
    //         'Accept-Language': 'hi_IN'
    //     }
    // };

    console.log(DATE, districtId)
    fetch("https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByDistrict?district_id="+districtId+"&date=" + DATE, {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiJlMzNmNWNiNC1iZjRhLTRjYTktYWViZi1jNDRiYjdmYWU1NzEiLCJ1c2VyX2lkIjoiZTMzZjVjYjQtYmY0YS00Y2E5LWFlYmYtYzQ0YmI3ZmFlNTcxIiwidXNlcl90eXBlIjoiQkVORUZJQ0lBUlkiLCJtb2JpbGVfbnVtYmVyIjo4MTk3MDY4OTY1LCJiZW5lZmljaWFyeV9yZWZlcmVuY2VfaWQiOjI3MTIyMTcwNDEyMDMwLCJ1YSI6Ik1vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzIpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS85MC4wLjQ0MzAuODUgU2FmYXJpLzUzNy4zNiIsImRhdGVfbW9kaWZpZWQiOiIyMDIxLTA1LTAzVDA1OjMwOjIzLjk2OFoiLCJpYXQiOjE2MjAwMTk4MjMsImV4cCI6MTYyMDAyMDcyM30.uf40g5SSq5j4-BRQDveQ7hBjQh-iPpamA1-R8dLAMPg",
    "if-none-match": "W/\"505a-T3xkwtyYKW5fd38xwXM6Pvj7dUI\"",
    "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"90\", \"Google Chrome\";v=\"90\"",
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site"
  },
  "referrer": "https://selfregistration.cowin.gov.in/",
  "referrerPolicy": "strict-origin-when-cross-origin",
  "body": null,
  "method": "GET",
  "mode": "cors"
}).then(res => res.json())
        .then(function (data) {

            let sessions = data.sessions
            console.log("for District: "+ districtName[districtId] +" date: " + DATE + " count: " + sessions.length)
            
            let validSlots = sessions.filter(slot => slot.min_age_limit <= 18 &&  slot.available_capacity > 0)
            console.log({date:DATE, districtId: districtId, validSlots: validSlots.length})
            if(validSlots.length > 0) {
                notifyMe(validSlots, districtName[districtId]);
            } else {
                console.log("None found yet for post date: " + DATE + " in district: " + districtName[districtId])
            }
            
        })
        .catch(function (error) {
            console.log(error);
            generalNotify("Error Occured:\n" + error)
        });
}

async function notifyMe(validSlots, districtName){
    let slotDetails = JSON.stringify(validSlots, null, '\t');
    // notifier.sendEmail(EMAIL, 'VACCINE AVAILABLE', slotDetails, (err, result) => {
    //     if(err) {
    //         console.error({err});
    //     }
    // })

    fetch(SLACK_HOOK, {
        method: 'POST',
        headers: {
            'Content-type': 'application/json',
            'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({"text":"@channel slots found in "+ districtName +": \n" + slotDetails, "link_names": 1})
    }).then((e) => console.log(e));

};

async function generalNotify(msg) {
    fetch(SLACK_HOOK, {
        method: 'POST',
        headers: {
            'Content-type': 'application/json',
            'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({"text":msg})
    }).then((e) => console.log(e));
}

async function fetchNext2weeks(){
    let dates = [];
    let today = moment();
    for(let i = 0 ; i < 2 ; i ++ ){
        let dateString = today.format('DD-MM-YYYY')
        dates.push(dateString);
        today.add(7, 'day');
    }
    return dates;
}


main()
    .then(() => {console.log('Vaccine availability checker started.');});
