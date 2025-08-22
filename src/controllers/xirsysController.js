const axios = require('axios');

exports.getIceServers = async (req, res) => {
  try {
    const response = await axios.put(
      'https://abutnal:98de36c2-7e6a-11f0-83d4-0242ac140002@global.xirsys.net/_turn/MyWebRTCApp',
      { format: 'urls' },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Xirsys ICE servers', details: error.message });
  }
};
