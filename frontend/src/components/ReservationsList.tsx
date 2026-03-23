import React from 'react';

export const ReservationsList: React.FC = () => {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Reservations</h1>
            <div className="bg-white shadow rounded-lg p-6">
                <p className="text-gray-500">Reservation calendar and booking details will appear here.</p>
                <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded-md">
                    🚧 This feature is currently under development.
                </div>
            </div>
        </div>
    );
};

export default ReservationsList;
